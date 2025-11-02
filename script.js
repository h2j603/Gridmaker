let modules = [];
let desktopColumns = 6, desktopGap = 10;
let targetColumns = 2, mobileGap = 10;
let responsiveMode = 'reflow';
let currentView = 'desktop', selectedModule = null, activeTab = 'html', draggedIndex = null;
let desktopOrder = [], mobileOrder = [];
let mobileOrderLocked = false;

// --- [신규] 히스토리(Undo/Redo) 변수 ---
let history = [];
let historyIndex = -1;

// --- [신규] 상태 복사용 헬퍼 ---
function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// --- [신규] 상태 저장 ---
function saveState() {
  // 현재 히스토리 인덱스 뒤의 미래 상태(redo 스택)를 모두 제거
  if (historyIndex < history.length - 1) {
    history.splice(historyIndex + 1);
  }
  
  // 현재 상태를 깊은 복사(deep copy)하여 저장
  const state = {
    modules: deepCopy(modules),
    desktopOrder: [...desktopOrder],
    mobileOrder: [...mobileOrder],
    selectedModuleId: selectedModule !== null ? modules[selectedModule].id : null
  };
  
  history.push(state);
  historyIndex = history.length - 1;
  
  // 히스토리 스택이 너무 커지는 것을 방지 (예: 100단계)
  if (history.length > 100) {
    history.shift();
    historyIndex--;
  }
  
  updateUndoRedoButtons();
}

// --- [신규] 상태 불러오기 ---
function loadState(state) {
  if (!state) return;
  
  modules = deepCopy(state.modules);
  desktopOrder = [...state.desktopOrder];
  mobileOrder = [...state.mobileOrder];
  
  if (state.selectedModuleId !== null) {
    selectedModule = modules.findIndex(m => m.id === state.selectedModuleId);
    if (selectedModule === -1) selectedModule = null; // ID를 못찾으면 선택 해제
  } else {
    selectedModule = null;
  }
  
  render();
  updateEditPanel(); // 편집 패널 상태 동기화
  updateUndoRedoButtons();
}

// --- [신규] Undo/Redo 함수 ---
function undo() {
  if (historyIndex > 0) {
    historyIndex--;
    loadState(history[historyIndex]);
  }
}

function redo() {
  if (historyIndex < history.length - 1) {
    historyIndex++;
    loadState(history[historyIndex]);
  }
}

// --- [신규] Undo/Redo 버튼 활성/비활성 ---
function updateUndoRedoButtons() {
  document.getElementById('undo-btn').disabled = (historyIndex <= 0);
  document.getElementById('redo-btn').disabled = (historyIndex >= history.length - 1);
}

function toggleColorPicker(prefix, isTransparent) {
  const colorInput = document.getElementById(prefix + '-color');
  colorInput.disabled = isTransparent;
  colorInput.style.opacity = isTransparent ? 0.5 : 1;
  if (prefix === 'edit' && selectedModule !== null) {
    const m = modules[selectedModule];
    if (m.transparent !== isTransparent) {
        m.transparent = isTransparent;
        render();
        saveState(); // [히스토리] 상태 저장
    }
  }
}

function calculateMobileSpan(desktopCol, desktopCols, targetCols) {
  const ratio = desktopCol / desktopCols;
  const calculated = Math.round(ratio * targetCols);
  return Math.max(1, Math.min(calculated, targetCols));
}

function getMobileSpan(module) {
  const clampedTarget = Math.min(module.mobileCol, targetColumns);
  if(module.mobileCol !== undefined && module.mobileCol !== null && module.mobileCol !== '') {
    return Math.max(1, clampedTarget);
  }
  return calculateMobileSpan(module.col, desktopColumns, targetColumns);
}

function switchView(view) {
  currentView = view;
  document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelector(`.view-btn[onclick="switchView('${view}')"]`).classList.add('active');
  document.getElementById('canvas').classList.toggle('mobile-view', view === 'mobile');
  deselectModule(); // 뷰 전환 시 선택 해제 (히스토리 저장 없음)
  render();
}

function selectMode(mode) {
  if (mode !== 'reflow') {
    showToast('이 모드는 현재 아키텍처에서 지원되지 않습니다.');
    return;
  }
  responsiveMode = mode;
  document.querySelectorAll('.mode-option').forEach(opt => opt.classList.remove('selected'));
  document.querySelector(`[data-mode="${mode}"]`).classList.add('selected');
  updateModeHint();
  updateCode();
  showToast(getModeLabel(mode) + ' 모드');
  // 뷰 모드 변경은 히스토리 저장 안함
}

function getModeLabel(mode) {
  return {'reflow':'리플로우','center':'중앙 유지','left':'왼쪽 유지','right':'오른쪽 유지','custom':'커스텀'}[mode];
}

function updateModeHint() {
  const hint = document.getElementById('mode-hint');
  hint.textContent = `${desktopColumns}열 → ${targetColumns}열로 리플로우`;
}

function updateMobileSpanHint() {
  if(selectedModule === null) return;
  const m = modules[selectedModule];
  const auto = calculateMobileSpan(m.col, desktopColumns, targetColumns);
  const hint = document.getElementById('mobile-span-hint');
  hint.textContent = `자동: ${auto}열 (${m.col}/${desktopColumns} × ${targetColumns})`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

function toggleMobileOrderLock(event) {
  mobileOrderLocked = event.target.checked;
  if (mobileOrderLocked) {
    mobileOrder = [...desktopOrder];
    showToast('모바일 순서가 데스크톱에 동기화됩니다.');
    render();
    saveState(); // [히스토리] 상태 저장
  } else {
    showToast('모바일 순서 동기화 해제');
  }
}

function init() {
  document.getElementById('columns').addEventListener('input', e => { 
    desktopColumns = clamp(parseInt(e.target.value) || 1, 1, 12);
    updateStats(); updateModeHint(); updateMobileSpanHint(); render(); 
    // 히스토리 저장은 input 이벤트가 끝날 때(change) 하는 것이 좋으나,
    // 편의를 위해 여기서는 리스너 마지막에 saveState()를 호출합니다.
  });
  // [히스토리] input 대신 change 이벤트로 저장
  document.getElementById('columns').addEventListener('change', e => { saveState(); });

  document.getElementById('gap').addEventListener('input', e => { 
    desktopGap = clamp(parseInt(e.target.value) || 0, 0, 50);
    updateStats(); render(); 
  });
  document.getElementById('gap').addEventListener('change', e => { saveState(); });

  document.getElementById('target-columns').addEventListener('input', e => { 
    targetColumns = clamp(parseInt(e.target.value) || 1, 1, 12); 
    updateModeHint(); updateMobileSpanHint(); updateCode(); render();
  });
  document.getElementById('target-columns').addEventListener('change', e => { saveState(); });
  
  document.getElementById('canvas-scale').addEventListener('input', e => {
    const scaleValue = parseInt(e.target.value);
    document.getElementById('canvas').style.transform = `scale(${scaleValue / 100})`;
    document.getElementById('scale-readout').textContent = `${scaleValue}%`;
  });

  // --- 모듈 편집 리스너 (모두 'change' 이벤트에 saveState() 추가) ---
  
  // [신규] 모듈 타입 편집
  document.getElementById('edit-type').addEventListener('change', e => {
    if (selectedModule !== null) {
        modules[selectedModule].type = e.target.value;
        render();
        saveState();
    }
  });

  // [신규] 그룹 ID 편집
  document.getElementById('edit-group-id').addEventListener('change', e => {
    if (selectedModule !== null) {
        modules[selectedModule].groupId = e.target.value.trim() || null;
        render();
        saveState();
    }
  });

  document.getElementById('edit-col').addEventListener('input', e => { 
    if(selectedModule!==null) { 
      const maxCol = desktopColumns;
      modules[selectedModule].col = clamp(parseInt(e.target.value)||1, 1, maxCol);
      e.target.value = modules[selectedModule].col; 
      updateMobileSpanHint();
      render(); 
    }
  });
  document.getElementById('edit-col').addEventListener('change', e => { if(selectedModule!==null) saveState(); });

  document.getElementById('edit-row').addEventListener('input', e => { 
    if(selectedModule!==null) { 
      modules[selectedModule].row = clamp(parseInt(e.target.value)||1, 1, 99);
      e.target.value = modules[selectedModule].row;
      render(); 
    }});
  document.getElementById('edit-row').addEventListener('change', e => { if(selectedModule!==null) saveState(); });

  document.getElementById('edit-mobile-col').addEventListener('input', e => { 
    if(selectedModule!==null) { 
      const val = e.target.value;
      if (val === '') {
        modules[selectedModule].mobileCol = null;
      } else {
        const maxCol = targetColumns;
        modules[selectedModule].mobileCol = clamp(parseInt(val)||1, 1, maxCol);
        e.target.value = modules[selectedModule].mobileCol;
      }
      render(); 
    }
  });
  document.getElementById('edit-mobile-col').addEventListener('change', e => { if(selectedModule!==null) saveState(); });

  document.getElementById('edit-color').addEventListener('input', e => { 
      if(selectedModule!==null) { modules[selectedModule].color = e.target.value; render(); }
  });
  document.getElementById('edit-color').addEventListener('change', e => { if(selectedModule!==null) saveState(); });

  document.getElementById('edit-border-color').addEventListener('input', e => { 
    if(selectedModule!==null) { modules[selectedModule].borderColor = e.target.value; render(); }
  });
  document.getElementById('edit-border-color').addEventListener('change', e => { if(selectedModule!==null) saveState(); });

  document.getElementById('edit-border-width').addEventListener('input', e => { 
    if(selectedModule!==null) { 
      modules[selectedModule].borderWidth = clamp(parseInt(e.target.value) || 0, 0, 20);
      e.target.value = modules[selectedModule].borderWidth;
      render(); 
    }
  });
  document.getElementById('edit-border-width').addEventListener('change', e => { if(selectedModule!==null) saveState(); });

  updateStats(); 
  updateModeHint(); 
  render();
  saveState(); // [히스토리] 초기 상태 저장
}

function addCustomModule() {
  const col = clamp(parseInt(document.getElementById('custom-col').value) || 2, 1, desktopColumns);
  const row = clamp(parseInt(document.getElementById('custom-row').value) || 2, 1, 99);
  const color = document.getElementById('custom-color').value;
  const transparent = document.getElementById('custom-transparent').checked;
  const borderColor = document.getElementById('custom-border-color').value;
  const borderWidth = clamp(parseInt(document.getElementById('custom-border-width').value) || 0, 0, 20);
  const type = document.getElementById('custom-type').value; // [신규] 타입
  
  const newModule = { 
    col, row, color, transparent, borderColor, borderWidth, 
    mobileCol: null, id: Date.now(),
    type: type, // [신규] 타입 저장
    groupId: null // [신규] 그룹 ID
  };
  
  modules.push(newModule);
  desktopOrder.push(newModule.id);
  
  if (mobileOrderLocked) {
    mobileOrder.push(newModule.id);
  } else {
    mobileOrder.push(newModule.id);
  }
  
  document.getElementById('custom-transparent').checked = false;
  toggleColorPicker('custom', false);
  document.getElementById('custom-border-width').value = 0;

  showToast(`${col}×${row} ${type} 모듈 추가`);
  render();
  saveState(); // [히스토리] 상태 저장
}

// --- [수정] 편집 패널 업데이트 로직 분리 ---
function updateEditPanel() {
  if (selectedModule === null) {
    document.getElementById('edit-panel').style.display = 'none';
    return;
  }
  
  const m = modules[selectedModule];
  if (!m) { // 모듈이 없는 경우 (Undo 등으로 인해)
    document.getElementById('edit-panel').style.display = 'none';
    return;
  }
  
  document.getElementById('edit-panel').style.display = 'block';
  
  document.getElementById('edit-type').value = m.type || 'box'; // [신규] 타입
  document.getElementById('edit-group-id').value = m.groupId || ''; // [신규] 그룹 ID
  
  document.getElementById('edit-col').value = clamp(m.col, 1, desktopColumns);
  document.getElementById('edit-col').max = desktopColumns;
  document.getElementById('edit-row').value = m.row;
  document.getElementById('edit-mobile-col').value = m.mobileCol !== null ? clamp(m.mobileCol, 1, targetColumns) : '';
  document.getElementById('edit-mobile-col').max = targetColumns;
  
  document.getElementById('edit-color').value = m.color || '#8c6c3c';
  const isTransparent = m.transparent || false;
  document.getElementById('edit-transparent').checked = isTransparent;
  toggleColorPicker('edit', isTransparent);
  
  document.getElementById('edit-border-color').value = m.borderColor || '#000000';
  document.getElementById('edit-border-width').value = m.borderWidth || 0;
  
  updateMobileSpanHint();
}

function selectModule(index) {
  if (selectedModule === index) return; // 이미 선택됨
  selectedModule = index;
  updateEditPanel(); // 편집 패널 업데이트
  render(); // 선택 상태(.selected) 갱신
  // 선택 변경은 히스토리 저장 안함
}

function handleCanvasClick(event) {
  if (event.target.id === 'canvas' || event.target.id === 'grid') {
    deselectModule();
  }
}

function deselectModule() {
  if (selectedModule !== null) {
    selectedModule = null;
    updateEditPanel(); // 편집 패널 숨기기
    render();
    // 선택 해제는 히스토리 저장 안함
  }
}

function deleteSelected() {
  if(selectedModule !== null) {
    deleteModule(selectedModule, new Event('click')); 
  }
}

function deleteModule(index, event) {
  event.stopPropagation();
  const idToDelete = modules[index].id;
  
  // [신규] 그룹 ID가 있다면, 같은 그룹 모듈도 함께 삭제할지 물어볼 수 있음
  // (여기서는 일단 단일 삭제만 구현)
  
  modules.splice(index, 1);
  desktopOrder = desktopOrder.filter(id => id !== idToDelete);
  mobileOrder = mobileOrder.filter(id => id !== idToDelete);

  if(selectedModule === index) {
    selectedModule = null;
    updateEditPanel();
  } else if(selectedModule > index) {
    selectedModule--;
  }
  render();
  saveState(); // [히스토리] 상태 저장
}

function clearAll() {
  if(confirm('모든 모듈을 삭제하시겠습니까?')) {
    modules = [];
    desktopOrder = [];
    mobileOrder = [];
    selectedModule = null;
    updateEditPanel();
    showToast('전체 삭제');
    render();
    saveState(); // [히스토리] 상태 저장
  }
}

function handleDragStart(index, event) {
  draggedIndex = index;
  event.target.closest('.module').classList.add('dragging');
  event.dataTransfer.effectAllowed = 'move';
  // 드래그하는 모듈의 ID를 저장 (그룹 드래그를 위해)
  const order = currentView === 'desktop' ? desktopOrder : mobileOrder;
  event.dataTransfer.setData('text/plain', order[index]);
}

function handleDragEnd(event) {
  document.querySelectorAll('.module.dragging').forEach(el => el.classList.remove('dragging'));
  draggedIndex = null;
}

function handleDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
}

// --- [수정] 그룹 드래그를 지원하도록 handleDrop 수정 ---
function handleDrop(index, event) {
  event.preventDefault();
  event.stopPropagation();
  
  if(draggedIndex !== null && draggedIndex !== index) {
    const order = currentView === 'desktop' ? desktopOrder : mobileOrder;
    const draggedId = parseInt(event.dataTransfer.getData('text/plain'));
    const draggedModule = modules.find(m => m.id === draggedId);
    
    if (!draggedModule) { // 드래그된 모듈을 찾을 수 없음
        draggedIndex = null;
        return;
    }

    const groupId = draggedModule.groupId;
    let idsToMove = [];
    
    if (groupId) {
        // [그룹 드래그]
        // 현재 순서(order)에서 동일 그룹 ID를 가진 모듈 ID들을 순서대로 추출
        idsToMove = order.filter(id => {
            const m = modules.find(mod => mod.id === id);
            return m && m.groupId === groupId;
        });
    } else {
        // [단일 드래그]
        idsToMove.push(draggedId);
    }
    
    // 드롭 대상(target)이 드래그하는 그룹의 일부인지 확인
    const targetId = order[index];
    if (idsToMove.includes(targetId)) {
        draggedIndex = null;
        return; // 자기 자신 또는 그룹 동료에게 드롭한 경우 무시
    }

    // 1. 현재 순서(order)에서 이동할 ID들(idsToMove)을 제거
    let newOrder = order.filter(id => !idsToMove.includes(id));
    
    // 2. 제거된 새 순서(newOrder)에서 드롭 대상(targetId)의 새 인덱스를 찾음
    let newDropIndex = newOrder.indexOf(targetId);
    
    // 3. 드롭 대상의 인덱스에 이동할 ID들(idsToMove)을 삽입
    newOrder.splice(newDropIndex, 0, ...idsToMove);

    // 4. 새 순서를 현재 뷰에 적용
    if (currentView === 'desktop') {
      desktopOrder = newOrder;
      if (mobileOrderLocked) {
        mobileOrder = [...desktopOrder];
      }
    } else {
      mobileOrder = newOrder;
    }
    
    if (selectedModule !== null) {
        const selectedId = modules[selectedModule].id;
        // 선택된 모듈의 실제 인덱스가 변경되었을 수 있으므로 ID 기준으로 다시 찾음
        const actualIndex = modules.findIndex(m => m.id === selectedId);
        selectedModule = actualIndex;
    }
    
    render();
    saveState(); // [히스토리] 상태 저장
  }
  draggedIndex = null;
}

function getOrderedModules() {
  const order = currentView === 'desktop' ? desktopOrder : mobileOrder;
  // [수정] modules 배열에서 ID를 찾지 못하는 경우(Undo/Redo 등으로)를 대비해 filter(m => m) 추가
  return order.map(id => modules.find(m => m.id === id)).filter(m => m);
}

function updateStats() {
  document.getElementById('stat-columns').textContent = `${desktopColumns}개`;
  document.getElementById('stat-gap').textContent = `${desktopGap}px`;
  document.getElementById('stat-modules').textContent = `${modules.length}개`;
}

// --- [수정] 컴포넌트 렌더링 기능 추가 ---
function render() {
  const grid = document.getElementById('grid');
  const columns = currentView === 'desktop' ? desktopColumns : targetColumns;
  const gap = currentView === 'desktop' ? desktopGap : mobileGap;
  grid.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
  grid.style.gap = `${gap}px`;
  
  const orderedModules = getOrderedModules();
  
  grid.innerHTML = orderedModules.map((m, i) => {
    // m은 순서가 적용된 모듈 (getOrderedModules() 결과)
    // 실제 모듈 데이터(type 등)를 가져오기 위해 modules 배열에서 다시 찾음
    const actualIndex = modules.findIndex(mod => mod.id === m.id);
    if (actualIndex === -1) return ''; // 모듈이 없으면 렌더링 스킵
    
    const moduleData = modules[actualIndex]; // 실제 원본 데이터
    
    const isTransparent = moduleData.transparent || false;
    const bgColor = isTransparent ? 'transparent' : (moduleData.color || '#8c6c3c');
    const borderWidth = moduleData.borderWidth || 0;
    const borderColor = moduleData.borderColor || '#000000';
    const outlineStyle = borderWidth > 0 ? `outline: ${borderWidth}px solid ${borderColor}; outline-offset: -${borderWidth}px;` : '';
    
    const desktopColSpan = clamp(moduleData.col, 1, desktopColumns);
    const mobileColSpan = getMobileSpan(moduleData);
    const col = currentView === 'desktop' ? desktopColSpan : mobileColSpan;
    
    const showWarning = currentView === 'mobile' && 
                        moduleData.col > targetColumns && 
                        (moduleData.mobileCol === null || moduleData.mobileCol === undefined || moduleData.mobileCol === '');
    
    // [신규] 타입별 내부 HTML 생성
    let innerHTML = '';
    const moduleType = moduleData.type || 'box';
    if (moduleType === 'text') {
        innerHTML = `<p class="module-content">Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed non risus.</p>`;
    } else if (moduleType === 'image') {
        innerHTML = `<img src="https://via.placeholder.com/${desktopColSpan * 100}x${moduleData.row * 50}" alt="placeholder" class="module-content image">`;
    }
    
    return `
    <div class="module ${selectedModule === actualIndex ? 'selected' : ''} ${showWarning ? 'warning' : ''}" 
         style="grid-column: span ${col}; grid-row: span ${moduleData.row}; background: ${moduleType === 'box' ? bgColor : ''}; ${outlineStyle}"
         data-type="${moduleType}"
         data-group-id="${moduleData.groupId || ''}"
         onclick="selectModule(${actualIndex})"
         ondragover="handleDragOver(event)"
         ondrop="handleDrop(${i}, event)">
      ${innerHTML} 
      <div class="module-info">${moduleData.col}×${moduleData.row}</div>
      ${showWarning ? '<div class="module-warning">!</div>' : ''}
      <button class="module-delete" onclick="deleteModule(${actualIndex}, event)">×</button>
      <div class="module-drag-handle" 
           draggable="true" 
           ondragstart="handleDragStart(${i}, event)" 
           ondragend="handleDragEnd(event)">⠿</div>
    </div>
  `}).join('');
  
  updateStats(); 
  updateCode();
}

// --- [수정] 생성된 코드에 타입/그룹 반영 ---
function generateHTML() {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="grid-container">
${desktopOrder.map((id, i) => {
    const m = modules.find(mod => mod.id === id);
    if (!m) return '';
    const groupClass = m.groupId ? ` group-${m.groupId}` : '';
    // [수정] 타입과 그룹 클래스 추가
    return `     <div class="module module-${i + 1} type-${m.type || 'box'}${groupClass}">
${m.type === 'text' ? '       <p>Lorem ipsum...</p>' : (m.type === 'image' ? '       <img src="https://via.placeholder.com/150" alt="placeholder">' : '       ')}
     </div>`;
  }).join('\n')}
  </div>
</body>
</html>`;
}

function generateCSS() {
  let css = `body {
  margin: 0;
  background: whitesmoke;
  padding: ${desktopGap}px;
}

.grid-container {
  display: grid;
  grid-template-columns: repeat(${desktopColumns}, 1fr);
  gap: ${desktopGap}px;
}

.module {
  min-height: 60px;
}

/* [신규] 타입별 기본 스타일 */
.module.type-image {
  background: #e0e0e0;
}
.module.type-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.module.type-text {
  background: #ffffff;
  padding: 10px;
}

${desktopOrder.map((id, i) => {
    const m = modules.find(mod => mod.id === id);
    if (!m) return '';
    const desktopColSpan = clamp(m.col, 1, desktopColumns);
  
    const isTransparent = m.transparent || false;
    const bgColor = isTransparent ? 'transparent' : (m.color || '#8c6c3c');
    const borderWidth = m.borderWidth || 0;
    const borderColor = m.borderColor || '#000000';
    const outlineStyle = borderWidth > 0 ? `\n  outline: ${borderWidth}px solid ${borderColor};\n  outline-offset: -${borderWidth}px;` : '';
  
    // [수정] Box 타입일 때만 배경색 적용
    const backgroundStyle = (m.type === 'box' || !m.type) ? `background: ${bgColor};` : '';

    return `.module-${i + 1} {
  grid-column: span ${desktopColSpan};
  grid-row: span ${m.row};
  ${backgroundStyle}${outlineStyle}
}`;
  }).join('\n\n')}

/* 모바일 반응형 - ${getModeLabel(responsiveMode)} */
@media (max-width: 768px) {
  body { padding: ${mobileGap}px; }
  .grid-container {
    grid-template-columns: repeat(${targetColumns}, 1fr);
    gap: ${mobileGap}px;
  }
  
`;

  if(responsiveMode === 'reflow') {
      css += mobileOrder.map((id, i) => {
      const m = modules.find(mod => mod.id === id);
      if (!m) return '';
      const moduleClassIndex = desktopOrder.indexOf(id) + 1;
      if (moduleClassIndex === 0) return ''; 

      const mobileSpan = getMobileSpan(m);
      const comment = m.mobileCol !== null ? ' /* 수동 설정 */' : ` /* 자동: ${m.col}/${desktopColumns} × ${targetColumns} = ${mobileSpan} */`;
      
      return `   .module-${moduleClassIndex} {
    grid-column: span ${mobileSpan};${comment}
    grid-row: span ${m.row};
    order: ${i};
  }`;
    }).join('\n\n');
  } 

  css += '\n}';
  return css;
}

function updateCode() {
  document.getElementById('code-display').textContent = activeTab === 'html' ? generateHTML() : generateCSS();
}

function switchTab(tab, event) {
  activeTab = tab;
  document.querySelectorAll('.code-tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  updateCode();
}

function copyCode() {
  navigator.clipboard.writeText(activeTab === 'html' ? generateHTML() : generateCSS());
  showToast(`${activeTab.toUpperCase()} 코드 복사됨!`);
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.style.display = 'block';
  setTimeout(() => toast.style.display = 'none', 3000);
}

window.addEventListener('DOMContentLoaded', init);
