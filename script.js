if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(registration => {
        console.log('Service Worker registered with scope:', registration.scope);
      })
      .catch(error => {
        console.error('Service Worker registration failed:', error);
      });
  });
}


window.addEventListener('DOMContentLoaded', () => {
  const splash = document.getElementById('splash');

  setTimeout(() => {
    splash.classList.add('fade-out');

    setTimeout(() => {
      splash.style.display = 'none';
    }, 500); // transition 시간과 동일 (1초)
  }, 1000); // 첫 등장 후 약간 기다렸다가 사라지게 (선택)
});

// 메인 클래스
class AttendanceChecker {
    constructor() {
        this.currentYear = new Date().getFullYear();
        this.currentMonth = new Date().getMonth();
        this.currentMode = 'attendance';
        this.currentSelectedDate = null;
        this.currentEditingSchedule = null;
        this.currentEditingMemo = null;
        this.currentEditingCounter = null;
        this.currentEditingAttendance = null;
        this.activeTab = 'todo';
        this.currentTodoEditId = null;
        this.pendingConfirmAction = null;
        this.currentViewingDate = null;
    
        // 메모 편집 상태 관리용 프로퍼티 추가
        this.memoEditMode = false;
        this.originalMemoData = null;
    
        // 데이터 저장소
        this.attendanceData = {};
        this.attendanceLog = [];
        this.schedulesData = [];
        this.todoData = [];
        this.completedData = [];
        this.memoData = [];
        this.counterData = [];
    
        // 필터 상태
        this.currentScheduleFilter = null;
        this.currentTodoFilter = null;
        this.currentMemoFilter = null;
        this.currentCounterFilter = null;
        this.currentMemoSearch = '';
        this.currentScheduleSearch = '';
    
        this.init();
        this.loadData();
        this.loadRandomBackground();
        this.updateDateTime();
        this.renderCalendar();
        this.renderAttendanceLog();
    
        // 1초마다 시간 업데이트
        setInterval(() => this.updateDateTime(), 1000);
    }
    
    init() {
        this.initEventListeners();
    }
    
    // 토스트 알림 시스템
    showToast(message, type = 'info') {
        // 기존 토스트가 있다면 제거
        const existingToast = document.querySelector('.toast-notification');
        if (existingToast) {
            existingToast.remove();
        }
        
        const toast = document.createElement('div');
        toast.className = `toast-notification toast-${type}`;
        toast.textContent = message;
        
        document.body.appendChild(toast);
        
        // 애니메이션 트리거
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);
        
        // 1.5초 후 제거
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 1500);
    }
    
    // 일정의 유효한 날짜들을 미리 계산하는 함수
    calculateValidScheduleDates(schedule) {
        const validDates = [];
        const startDate = new Date(schedule.startDate + 'T00:00:00');
        const endDate = new Date(schedule.endDate + 'T00:00:00');
        
        const currentDate = new Date(startDate);
        
        while (currentDate <= endDate) {
            // 주말 제외 옵션 체크
            if (schedule.skipWeekends) {
                const dayOfWeek = currentDate.getDay(); // 0: 일요일, 6: 토요일
                if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                    validDates.push(this.getDateKey(currentDate));
                }
            } else {
                validDates.push(this.getDateKey(currentDate));
            }
            
            currentDate.setDate(currentDate.getDate() + 1);
        }
        
        return validDates;
    }
    
    // 일정의 특정 날짜가 몇 번째인지 찾는 함수
    getScheduleDateIndex(schedule, targetDate) {
        if (!schedule.validDates) {
            schedule.validDates = this.calculateValidScheduleDates(schedule);
        }
        
        const targetDateStr = this.getDateKey(targetDate);
        const index = schedule.validDates.indexOf(targetDateStr);
        
        return {
            currentIndex: index + 1, // 1부터 시작
            totalCount: schedule.validDates.length,
            isValid: index !== -1
        };
    }
    
    // 일정 편집 모달 시스템
    showScheduleEditModal(schedule) {
        const modal = document.getElementById('scheduleEditModal');
        const titleInput = document.getElementById('scheduleEditTitle');
        const startDateInput = document.getElementById('scheduleEditStartDate');
        const endDateInput = document.getElementById('scheduleEditEndDate');
        const skipWeekendsInput = document.getElementById('scheduleSkipWeekends'); // 수정된 부분
    
        this.currentEditingSchedule = schedule.id;
    
        titleInput.value = schedule.title;
        startDateInput.value = schedule.startDate;
        endDateInput.value = schedule.endDate;
        skipWeekendsInput.checked = schedule.skipWeekends || false;
    
        modal.style.display = 'flex';
        titleInput.focus();
    }
    
    hideScheduleEditModal() {
        document.getElementById('scheduleEditModal').style.display = 'none';
        this.currentEditingSchedule = null;
    }
    
    confirmScheduleEdit() {
        if (!this.currentEditingSchedule) return;
    
        const schedule = this.schedulesData.find(s => s.id === this.currentEditingSchedule);
        if (!schedule) return;
    
        const titleInput = document.getElementById('scheduleEditTitle');
        const startDateInput = document.getElementById('scheduleEditStartDate');
        const endDateInput = document.getElementById('scheduleEditEndDate');
        const skipWeekendsInput = document.getElementById('scheduleSkipWeekends'); // 수정된 부분
    
        const title = titleInput.value.trim();
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;
        const skipWeekends = skipWeekendsInput.checked;
    
        if (!title) {
            this.showToast('Title cannot be empty.', 'error');
            return;
        }
    
        if (!startDate || !endDate) {
            this.showToast('Please select both start and end dates.', 'error');
            return;
        }
    
        if (new Date(startDate) > new Date(endDate)) {
            this.showToast('End date cannot be earlier than start date.', 'error');
            return;
        }
    
        schedule.title = title;
        schedule.startDate = startDate;
        schedule.endDate = endDate;
        schedule.skipWeekends = skipWeekends;
        schedule.editedAt = this.formatDateTime(new Date());
    
        // 유효한 날짜들을 다시 계산
        schedule.validDates = this.calculateValidScheduleDates(schedule);
    
        this.saveData();
        this.renderAllSchedulesList();
        this.renderCalendar();
        if (this.currentMode === 'schedule') {
            this.renderMonthlyCalendar();
        }
        this.updateModeStats();
        this.hideScheduleEditModal();
        this.showToast('Schedule updated successfully!', 'success');
    }
    
    initEventListeners() {
        // 연도 네비게이션
        document.getElementById('prevYear').addEventListener('click', () => {
            this.currentYear--;
            this.updateYearDisplay();
            this.renderCalendar();
            if (this.currentMode === 'schedule') {
                this.renderMonthlyCalendar();
            }
        });
        
        document.getElementById('nextYear').addEventListener('click', () => {
            this.currentYear++;
            this.updateYearDisplay();
            this.renderCalendar();
            if (this.currentMode === 'schedule') {
                this.renderMonthlyCalendar();
            }
        });
        
        // 모드 선택 버튼
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.mode;
                this.switchMode(mode);
            });
        });
        
        // 월 네비게이션 (일정 모드)
        document.getElementById('prevMonth').addEventListener('click', () => {
            this.currentMonth--;
            if (this.currentMonth < 0) {
                this.currentMonth = 11;
                this.currentYear--;
                this.updateYearDisplay();
                this.renderCalendar();
            }
            this.renderMonthlyCalendar();
        });
        
        document.getElementById('nextMonth').addEventListener('click', () => {
            this.currentMonth++;
            if (this.currentMonth > 11) {
                this.currentMonth = 0;
                this.currentYear++;
                this.updateYearDisplay();
                this.renderCalendar();
            }
            this.renderMonthlyCalendar();
        });
        
        // 출석 관련 이벤트
        document.getElementById('attendBtn').addEventListener('click', () => {
            this.attendToday();
        });
        
        // 일정 관련 이벤트
        document.getElementById('viewAllSchedulesBtn').addEventListener('click', () => {
            this.showAllSchedulesModal();
        });
        
        document.getElementById('clearSchedulesBtn').addEventListener('click', () => {
            this.confirmClearAll('schedules');
        });
        
        // 투두리스트 이벤트
        document.getElementById('todoTabActive').addEventListener('click', () => {
            this.switchTodoTab('todo');
        });
        
        document.getElementById('todoTabCompleted').addEventListener('click', () => {
            this.switchTodoTab('completed');
        });
        
        document.getElementById('todoAddBtn').addEventListener('click', () => {
            this.addTodo();
        });
        
        document.getElementById('todoInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.addTodo();
            }
        });
        
        // 메모 이벤트
        document.getElementById('memoCreateBtn').addEventListener('click', () => {
            this.showMemoModal();
        });
        
        document.getElementById('memoSearchBtn').addEventListener('click', () => {
            this.searchMemos();
        });
        
        document.getElementById('memoSearchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.searchMemos();
            }
        });
        
        document.getElementById('memoClearSearchBtn').addEventListener('click', () => {
            this.clearMemoSearch();
        });
        
        // Day Counter 이벤트
        document.getElementById('counterCreateBtn').addEventListener('click', () => {
            this.showCounterModal();
        });
        
        // 전체 삭제 버튼들
        document.getElementById('clearAttendanceBtn').addEventListener('click', () => {
            this.confirmClearAll('attendance');
        });
        
        document.getElementById('todoClearBtn').addEventListener('click', () => {
            this.confirmClearAll('todo');
        });
        
        document.getElementById('completedClearBtn').addEventListener('click', () => {
            this.confirmClearAll('completed');
        });
        
        document.getElementById('memoClearBtn').addEventListener('click', () => {
            this.confirmClearAll('memo');
        });
        
        document.getElementById('counterClearBtn').addEventListener('click', () => {
            this.confirmClearAll('counter');
        });
        
        // 모달 이벤트들
        this.initModalEvents();
        
        // 필터 해제 이벤트들
        this.initFilterEvents();
    }initModalEvents() {
        // 일정 모달
        document.getElementById('scheduleModalCancel').addEventListener('click', () => {
            this.hideScheduleModal();
        });
        
        document.getElementById('scheduleModalConfirm').addEventListener('click', () => {
            this.confirmScheduleModal();
        });
        
        // 일정 편집 모달
        document.getElementById('scheduleEditCancel').addEventListener('click', () => {
            this.hideScheduleEditModal();
        });
        
        document.getElementById('scheduleEditConfirm').addEventListener('click', () => {
            this.confirmScheduleEdit();
        });
        
        // 메모 모달
        document.getElementById('memoModalClose').addEventListener('click', () => {
            this.hideMemoModal();
        });
        
        document.getElementById('memoModalEdit').addEventListener('click', () => {
            this.toggleMemoEdit();
        });
        
        document.getElementById('memoModalConfirm').addEventListener('click', () => {
            this.confirmMemoModal();
        });
        
        // Day Counter 모달
        document.getElementById('counterModalCancel').addEventListener('click', () => {
            this.hideCounterModal();
        });
        
        document.getElementById('counterModalConfirm').addEventListener('click', () => {
            this.confirmCounterModal();
        });
        
        // 전체 일정 보기 모달
        document.getElementById('allSchedulesClose').addEventListener('click', () => {
            this.hideAllSchedulesModal();
        });
        
        document.getElementById('scheduleSearchBtn').addEventListener('click', () => {
            this.searchSchedules();
        });
        
        document.getElementById('scheduleSearchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.searchSchedules();
            }
        });
        
        // 확인 모달
        document.getElementById('confirmModalCancel').addEventListener('click', () => {
            this.hideConfirmModal();
        });
        
        document.getElementById('confirmModalConfirm').addEventListener('click', () => {
            this.executeConfirmAction();
        });
        
        // 출석 편집 모달
        document.getElementById('attendanceEditCancel').addEventListener('click', () => {
            this.hideAttendanceEditModal();
        });
        
        document.getElementById('attendanceEditConfirm').addEventListener('click', () => {
            this.confirmAttendanceEdit();
        });
        
        // 출석 로그 보기 모달
        document.getElementById('attendanceLogModalClose').addEventListener('click', () => {
            this.hideAttendanceLogModal();
        });
        
        document.getElementById('attendanceLogModalDelete').addEventListener('click', () => {
            this.deleteAttendanceFromModal();
        });
    }

    initFilterEvents() {
        document.getElementById('scheduleFilterClear').addEventListener('click', () => {
            this.clearScheduleFilter();
        });
        
        document.getElementById('todoFilterClear').addEventListener('click', () => {
            this.clearTodoFilter();
        });
        
        document.getElementById('memoFilterClear').addEventListener('click', () => {
            this.clearMemoFilter();
        });
        
        document.getElementById('counterFilterClear').addEventListener('click', () => {
            this.clearCounterFilter();
        });
    }
    
    // 데이터 관리
    loadData() {
        try {
            const savedData = localStorage.getItem('attendanceCheckerData');
            if (savedData) {
                const data = JSON.parse(savedData);
                this.attendanceData = data.attendanceData || {};
                this.attendanceLog = data.attendanceLog || [];
                this.schedulesData = data.schedulesData || [];
                this.todoData = data.todoData || [];
                this.completedData = data.completedData || [];
                this.memoData = data.memoData || [];
                this.counterData = data.counterData || [];
                
                // 기존 일정 데이터에 validDates가 없는 경우 계산해서 추가
                this.schedulesData.forEach(schedule => {
                    if (!schedule.validDates) {
                        schedule.validDates = this.calculateValidScheduleDates(schedule);
                    }
                });
            }
        } catch (error) {
            console.error('Error loading data:', error);
            this.resetData();
        }
        
        // 데이터 타입 검증 및 수정
        if (!Array.isArray(this.memoData)) {
            console.warn('memoData is not an array, converting...');
            this.memoData = [];
        }
        if (!Array.isArray(this.todoData)) {
            this.todoData = [];
        }
        if (!Array.isArray(this.completedData)) {
            this.completedData = [];
        }
        if (!Array.isArray(this.schedulesData)) {
            this.schedulesData = [];
        }
        if (!Array.isArray(this.counterData)) {
            this.counterData = [];
        }
        if (!Array.isArray(this.attendanceLog)) {
            this.attendanceLog = [];
        }
        
        // 출석 로그에 메모 필드 추가 (기존 데이터 호환)
        this.attendanceLog = this.attendanceLog.map(log => ({
            ...log,
            memo: log.memo || '',
            clockedOut: log.clockedOut || null
        }));
    }
    
    saveData() {
        try {
            const data = {
                attendanceData: this.attendanceData,
                attendanceLog: this.attendanceLog,
                schedulesData: this.schedulesData,
                todoData: this.todoData,
                completedData: this.completedData,
                memoData: this.memoData,
                counterData: this.counterData
            };
            localStorage.setItem('attendanceCheckerData', JSON.stringify(data));
        } catch (error) {
            console.error('Error saving data:', error);
        }
    }
    
    resetData() {
        this.attendanceData = {};
        this.attendanceLog = [];
        this.schedulesData = [];
        this.todoData = [];
        this.completedData = [];
        this.memoData = [];
        this.counterData = [];
    }
    
    // 유틸리티 함수
    formatDateTime(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }
    
    getDateKey(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    
    updateDateTime() {
        const now = new Date();
        const dateTimeStr = now.toLocaleString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        document.getElementById('currentDateTime').textContent = dateTimeStr;
    }
    
    updateYearDisplay() {
        document.getElementById('currentYear').textContent = this.currentYear;
    }
    
    loadRandomBackground() {
        const randomNum = Math.floor(Math.random() * 10) + 1;
        const bgImage = document.getElementById('backgroundImage');
        const imagePath = `src/bg${randomNum}.jpg`;
        
        const testImage = new Image();
        testImage.onload = () => {
            bgImage.src = imagePath;
            bgImage.style.display = 'block';
        };
        testImage.onerror = () => {
            bgImage.style.display = 'none';
        };
        testImage.src = imagePath;
    }
    
    // 확인 모달
    showConfirmModal(title, message, action) {
        const modal = document.getElementById('confirmModal');
        const titleElement = document.getElementById('confirmModalTitle');
        const messageElement = document.getElementById('confirmModalMessage');
        
        titleElement.textContent = title;
        messageElement.textContent = message;
        this.pendingConfirmAction = action;
        
        modal.style.display = 'flex';
    }
    
    hideConfirmModal() {
        document.getElementById('confirmModal').style.display = 'none';
        this.pendingConfirmAction = null;
    }
    
    executeConfirmAction() {
        if (this.pendingConfirmAction) {
            this.pendingConfirmAction();
        }
        this.hideConfirmModal();
    }
    
    // 모드 전환
    switchMode(mode) {
        this.currentMode = mode;
        
        // 모드 버튼 활성화 상태 업데이트
        document.querySelectorAll('.mode-btn').forEach(btn => {
            if (btn.dataset.mode === mode) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        // 콘텐츠 패널 표시/숨김
        document.querySelectorAll('.content-panel').forEach(panel => {
            panel.style.display = 'none';
        });
        
        const contentMap = {
            'attendance': 'attendanceContent',
            'schedule': 'scheduleContent', 
            'todo': 'todoContent',
            'memo': 'memoContent',
            'counter': 'counterContent'
        };
        
        const targetContent = document.getElementById(contentMap[mode]);
        if (targetContent) {
            targetContent.style.display = 'flex';
        }
        
        // 모드별 초기화
        if (mode === 'schedule') {
            this.renderMonthlyCalendar();
        } else if (mode === 'todo') {
            this.renderTodoList();
        } else if (mode === 'memo') {
            this.renderMemoList();
        } else if (mode === 'counter') {
            this.renderCounterList();
        } else if (mode === 'attendance') {
            this.renderAttendanceLog();
        }
        
        // 통계 업데이트
        this.updateModeStats();
        
        // 시각화 캘린더 업데이트
        this.renderCalendar();
    }// 출석 관리
    isAttended(date) {
        return this.attendanceData[this.getDateKey(date)] || false;
    }
    
    toggleAttendance(date) {
        const key = this.getDateKey(date);
        const wasAttended = this.attendanceData[key];
        
        if (wasAttended) {
            // 이미 출석된 날짜 클릭 시 로그 보기
            this.showAttendanceLogForDate(date);
            return;
        }
        
        this.attendanceData[key] = true;
        
        // 출석 체크 - 로그에 추가
        const logEntry = {
            date: key,
            timestamp: this.formatDateTime(new Date()),
            memo: '',
            clockedOut: null,
            id: Date.now()
        };
        this.attendanceLog.push(logEntry);
        
        this.saveData();
        this.updateStats();
        this.renderAttendanceLog();
    }
    
    attendToday() {
        const today = new Date();
        const key = this.getDateKey(today);
        
        if (this.attendanceData[key]) {
            this.showToast('Already attended today!', 'warning');
            return;
        }
        
        this.attendanceData[key] = true;
        
        const logEntry = {
            date: key,
            timestamp: this.formatDateTime(new Date()),
            memo: '',
            clockedOut: null,
            id: Date.now()
        };
        this.attendanceLog.push(logEntry);
        
        this.saveData();
        this.updateStats();
        this.renderAttendanceLog();
        this.renderCalendar();
        this.showToast('Attendance recorded successfully!', 'success');
    }
    
    clockOutAttendance(id) {
        const log = this.attendanceLog.find(l => l.id === id);
        if (log && !log.clockedOut) {
            log.clockedOut = this.formatDateTime(new Date());
            this.saveData();
            this.renderAttendanceLog();
            this.showToast('Clocked out successfully!', 'success');
        }
    }
    
    deleteAttendanceLog(id) {
        this.showConfirmModal(
            'Delete Attendance',
            'Are you sure you want to delete this attendance record?',
            () => {
                const logIndex = this.attendanceLog.findIndex(l => l.id === id);
                if (logIndex !== -1) {
                    const log = this.attendanceLog[logIndex];
                    delete this.attendanceData[log.date];
                    this.attendanceLog.splice(logIndex, 1);
                    this.saveData();
                    this.updateStats();
                    this.renderAttendanceLog();
                    this.renderCalendar();
                    this.showToast('Attendance record deleted!', 'success');
                }
            }
        );
    }
    
    deleteAttendanceFromModal() {
        // 현재 출석 로그 모달에서 보고 있는 날짜의 출석 기록들을 삭제
        if (!this.currentViewingDate) return;

        const dateKey = this.getDateKey(this.currentViewingDate);
        const logs = this.attendanceLog.filter(log => log.date === dateKey);

        if (logs.length === 0) return;

        // 모달을 먼저 닫고 삭제 확인 진행
        this.hideAttendanceLogModal();

        this.showConfirmModal(
            'Delete Attendance Records',
            `Are you sure you want to delete all attendance records for this date?`,
            () => {
                // 해당 날짜의 모든 출석 로그 삭제
                this.attendanceLog = this.attendanceLog.filter(log => log.date !== dateKey);
                delete this.attendanceData[dateKey];
            
                this.saveData();
                this.updateStats();
                this.renderAttendanceLog();
                this.renderCalendar();
                this.showToast('Attendance records deleted!', 'success');
            }
        );
    }
    
    showAttendanceEditModal(id) {
        const log = this.attendanceLog.find(l => l.id === id);
        if (!log) return;
        
        this.currentEditingAttendance = id;
        const modal = document.getElementById('attendanceEditModal');
        const memoInput = document.getElementById('attendanceEditMemo');
        const checkedInInput = document.getElementById('attendanceEditCheckedIn');
        const clockedOutInput = document.getElementById('attendanceEditClockedOut');
        
        memoInput.value = log.memo || '';
        
        // timestamp를 datetime-local 형식으로 변환
        const checkedInDate = new Date(log.timestamp);
        checkedInInput.value = this.formatDateTimeLocal(checkedInDate);
        
        if (log.clockedOut) {
            const clockedOutDate = new Date(log.clockedOut);
            clockedOutInput.value = this.formatDateTimeLocal(clockedOutDate);
        } else {
            clockedOutInput.value = '';
        }
        
        modal.style.display = 'flex';
        memoInput.focus();
    }
    
    hideAttendanceEditModal() {
        document.getElementById('attendanceEditModal').style.display = 'none';
        this.currentEditingAttendance = null;
    }
    
    confirmAttendanceEdit() {
        if (!this.currentEditingAttendance) return;
        
        const log = this.attendanceLog.find(l => l.id === this.currentEditingAttendance);
        if (!log) return;
        
        const memoInput = document.getElementById('attendanceEditMemo');
        const checkedInInput = document.getElementById('attendanceEditCheckedIn');
        const clockedOutInput = document.getElementById('attendanceEditClockedOut');
        
        log.memo = memoInput.value.trim();
        
        if (checkedInInput.value) {
            const checkedInDate = new Date(checkedInInput.value);
            log.timestamp = this.formatDateTime(checkedInDate);
        }
        
        if (clockedOutInput.value) {
            const clockedOutDate = new Date(clockedOutInput.value);
            log.clockedOut = this.formatDateTime(clockedOutDate);
        } else {
            log.clockedOut = null;
        }
        
        this.saveData();
        this.renderAttendanceLog();
        this.hideAttendanceEditModal();
        this.showToast('Attendance record updated!', 'success');
    }
    
    formatDateTimeLocal(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    }
    
    showAttendanceLogForDate(date) {
        const dateKey = this.getDateKey(date);
        const logs = this.attendanceLog.filter(log => log.date === dateKey);
        
        this.currentViewingDate = date; // 현재 보고 있는 날짜 저장
        
        const modal = document.getElementById('attendanceLogModal');
        const title = document.getElementById('attendanceLogModalTitle');
        const content = document.getElementById('attendanceLogModalContent');
        
        const formattedDate = date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long'
        });
        
        title.textContent = `Attendance Log - ${formattedDate}`;
        content.innerHTML = '';
        
        if (logs.length === 0) {
            content.innerHTML = '<p>No attendance records for this date.</p>';
        } else {
            logs.forEach(log => {
                const logElement = document.createElement('div');
                logElement.className = 'attendance-log-detail';
                
                let timeInfo = `Checked in: ${log.timestamp}`;
                if (log.clockedOut) {
                    timeInfo += `<br>Clocked out: ${log.clockedOut}`;
                }
                
                logElement.innerHTML = `
                    <div class="attendance-log-memo">${log.memo || 'No memo'}</div>
                    <div class="attendance-log-time">${timeInfo}</div>
                `;
                content.appendChild(logElement);
            });
        }
        
        modal.style.display = 'flex';
    }
    
    hideAttendanceLogModal() {
        document.getElementById('attendanceLogModal').style.display = 'none';
        this.currentViewingDate = null;
    }

    updateStats() {
        const attendedDays = Object.values(this.attendanceData).filter(Boolean).length;
        document.getElementById('totalAttendance').textContent = attendedDays;
    }
    
    updateModeStats() {
        const statsElement = document.getElementById('totalAttendance');
        if (!statsElement) return;
        
        const currentYearStart = new Date(this.currentYear, 0, 1);
        const currentYearEnd = new Date(this.currentYear, 11, 31);
        
        let count = 0;
        let label = '';
        
        switch(this.currentMode) {
            case 'attendance':
                count = Object.values(this.attendanceData).filter(Boolean).length;
                label = 'Total Attendance Days';
                break;
                
            case 'schedule':
                count = this.schedulesData.filter(schedule => {
                    const scheduleYear = new Date(schedule.startDate).getFullYear();
                    return scheduleYear === this.currentYear;
                }).length;
                label = 'Total Schedules';
                break;
                
            case 'todo':
                if (this.activeTab === 'completed') {
                    count = this.completedData.filter(todo => {
                        if (!todo.completedAt) return false;
                        const completedYear = new Date(todo.completedAt).getFullYear();
                        return completedYear === this.currentYear;
                    }).length;
                    label = 'Completed Todos';
                } else {
                    count = this.todoData.filter(todo => {
                        const createdYear = new Date(todo.createdAt).getFullYear();
                        return createdYear === this.currentYear;
                    }).length;
                    label = 'Total Todos';
                }
                break;
                
            case 'memo':
                count = this.memoData.filter(memo => {
                    const createdYear = new Date(memo.createdAt).getFullYear();
                    return createdYear === this.currentYear;
                }).length;
                label = 'Total Memos';
                break;
                
            case 'counter':
                count = this.counterData.filter(counter => {
                    const createdYear = new Date(counter.createdAt).getFullYear();
                    return createdYear === this.currentYear;
                }).length;
                label = 'Total Counters';
                break;
                
            default:
                count = Object.values(this.attendanceData).filter(Boolean).length;
                label = 'Total Attendance Days';
        }
        
        statsElement.textContent = count;
        
        // 라벨도 업데이트
        const statsContainer = statsElement.parentElement;
        if (statsContainer) {
            statsContainer.innerHTML = `<span>${label}: <span id="totalAttendance">${count}</span></span>`;
        }
    }
    
    renderAttendanceLog() {
        const logContainer = document.getElementById('attendanceLog');
        logContainer.innerHTML = '';
    
        if (this.attendanceLog.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'empty-state';
            emptyState.innerHTML = `
                <h3>No attendance records</h3>
                <p>Click on dates in the calendar above to mark attendance or use the Attend button</p>
            `;
            logContainer.appendChild(emptyState);
            return;
        }
    
        // 최신순으로 정렬
        const sortedLog = [...this.attendanceLog].sort((a, b) => 
            new Date(b.timestamp) - new Date(a.timestamp)
        );
    
        sortedLog.forEach(log => {
            const item = document.createElement('div');
            item.className = 'attendance-log-item';
        
            const date = new Date(log.date);
            const formattedDate = date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                weekday: 'long'
            });
        
            let timeInfo = `Checked in at: ${log.timestamp}`;
            if (log.clockedOut) {
                timeInfo += `<br>Clocked out at: ${log.clockedOut}`;
            }
        
            // 메모 입력 필드 - readonly로 설정
            const memoValue = log.memo || '';
        
            item.innerHTML = `
                <div class="attendance-info">
                    <input type="text" class="attendance-memo-input" value="${memoValue}" 
                        placeholder="Enter memo..." readonly>
                    <div class="attendance-time">${timeInfo}</div>
                </div>
                <div class="attendance-controls">
                    ${!log.clockedOut ? `<button class="attendance-btn clock-out" onclick="attendanceChecker.clockOutAttendance(${log.id})">Clock Out</button>` : ''}
                    <button class="attendance-btn edit" onclick="attendanceChecker.showAttendanceEditModal(${log.id})">Edit</button>
                    <button class="attendance-btn delete" onclick="attendanceChecker.deleteAttendanceLog(${log.id})">Delete</button>
                </div>
            `;
        
            logContainer.appendChild(item);
        });
    
        this.updateStats();
    }
    
    updateAttendanceMemo(id, memo) {
        const log = this.attendanceLog.find(l => l.id === id);
        if (log) {
            log.memo = memo;
            this.saveData();
        }
    }
    
    // 캘린더 시각화
    renderCalendar() {
        const calendar = document.getElementById('calendar');
        calendar.innerHTML = '';
        
        const startDate = new Date(this.currentYear, 0, 1);
        const endDate = new Date(this.currentYear, 11, 31);
        
        const firstWeekStart = new Date(startDate);
        firstWeekStart.setDate(startDate.getDate() - startDate.getDay());
        
        let currentDate = new Date(firstWeekStart);
        
        while (currentDate <= endDate || currentDate.getDay() !== 0) {
            const weekColumn = document.createElement('div');
            weekColumn.className = 'week-column';
            
            // 월 라벨 체크
            let hasNewMonth = false;
            let newMonthName = '';
            
            for (let i = 0; i < 7; i++) {
                const testDate = new Date(currentDate);
                testDate.setDate(currentDate.getDate() + i);
                
                if (testDate.getDate() === 1 && testDate.getFullYear() === this.currentYear) {
                    hasNewMonth = true;
                    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    newMonthName = monthNames[testDate.getMonth()];
                    break;
                }
            }
            
            if (hasNewMonth) {
                const monthLabel = document.createElement('div');
                monthLabel.className = 'month-label';
                monthLabel.textContent = newMonthName;
                weekColumn.appendChild(monthLabel);
            }
            
            // 일주일 날짜 셀 생성
            for (let day = 0; day < 7; day++) {
                const dayCell = document.createElement('div');
                dayCell.className = 'day-cell';
                
                const cellDate = new Date(currentDate);
                
                if (cellDate.getFullYear() !== this.currentYear) {
                    dayCell.classList.add('empty');
                } else {
                    this.applyVisualizationStyles(dayCell, cellDate);
                    
                    // 클릭 이벤트 추가
                    dayCell.addEventListener('click', () => {
                        this.handleCalendarClick(cellDate);
                    });
                }
                
                // 툴팁 이벤트
                if (!dayCell.classList.contains('empty')) {
                    dayCell.addEventListener('mouseenter', (e) => {
                        this.showTooltip(e, cellDate);
                    });
                    
                    dayCell.addEventListener('mouseleave', () => {
                        this.hideTooltip();
                    });
                    
                    dayCell.addEventListener('mousemove', (e) => {
                        this.updateTooltipPosition(e);
                    });
                }
                
                weekColumn.appendChild(dayCell);
                currentDate.setDate(currentDate.getDate() + 1);
            }
            
            calendar.appendChild(weekColumn);
            
            if (currentDate.getFullYear() > this.currentYear) {
                break;
            }
        }
    }
    
    // 수정된 applyVisualizationStyles 함수 (일정 개수에 따른 밝기 조절)
    applyVisualizationStyles(dayCell, date) {
        dayCell.classList.add('level-0');
        
        if (this.currentMode === 'attendance') {
            if (this.isAttended(date)) {
                dayCell.classList.add('attended');
            }
        } else if (this.currentMode === 'schedule') {
            const schedules = this.getSchedulesForDate(date);
            if (schedules.length > 0) {
                dayCell.classList.add('schedule-active');
                
                // 일정 개수에 따른 밝기 조절
                if (schedules.length === 1) {
                    dayCell.classList.add('schedule-single'); // 50% 밝기
                } else if (schedules.length === 2) {
                    dayCell.classList.add('schedule-double'); // 75% 밝기
                } else {
                    dayCell.classList.add('schedule-multiple'); // 100% 밝기
                }
            }
        } else if (this.currentMode === 'todo') {
            const createdTodos = this.getTodosCreatedOnDate(date);
            const completedTodos = this.getTodosCompletedOnDate(date);
            
            if (this.activeTab === 'todo' && createdTodos.length > 0) {
                dayCell.classList.add('todo-created');
            } else if (this.activeTab === 'completed' && completedTodos.length > 0) {
                dayCell.classList.add('todo-completed');
            }
        } else if (this.currentMode === 'memo') {
            const memos = this.getMemosCreatedOnDate(date);
            if (memos.length > 0) {
                dayCell.classList.add('memo-created');
            }
        } else if (this.currentMode === 'counter') {
            const counters = this.getCountersForDate(date);
            if (counters.length > 0) {
                dayCell.classList.add('counter-target');
            }
        }
    }
    
    handleCalendarClick(date) {
        if (this.currentMode === 'attendance') {
            this.toggleAttendance(date);
            this.renderCalendar();
        } else if (this.currentMode === 'schedule') {
            this.showScheduleModal(date);
        } else if (this.currentMode === 'todo') {
            const dateKey = this.getDateKey(date);
            this.setTodoFilter(dateKey);
            this.switchMode('todo');
        } else if (this.currentMode === 'memo') {
            const dateKey = this.getDateKey(date);
            this.setMemoFilter(dateKey);
            this.switchMode('memo');
        } else if (this.currentMode === 'counter') {
            const dateKey = this.getDateKey(date);
            this.setCounterFilter(dateKey);
            this.switchMode('counter');
        }
    }
    
    // 툴팁
    showTooltip(e, date) {
        const tooltip = document.getElementById('tooltip');
        const content = this.getTooltipContent(date);
        
        tooltip.innerHTML = content;
        tooltip.style.display = 'block';
        this.updateTooltipPosition(e);
    }
    
    getTooltipContent(date) {
        const formattedDate = date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        let content = formattedDate;
        
        if (this.currentMode === 'attendance') {
            if (this.isAttended(date)) {
                content += '<br>✓ Attended (Click to view details)';
            }
        } else if (this.currentMode === 'schedule') {
            const schedules = this.getSchedulesForDate(date);
            if (schedules.length > 0) {
                content += '<br>Schedules:';
                schedules.forEach(schedule => {
                    content += `<br>• ${schedule.title}`;
                });
            }
        } else if (this.currentMode === 'todo') {
            const created = this.getTodosCreatedOnDate(date);
            const completed = this.getTodosCompletedOnDate(date);
            if (created.length > 0) {
                content += `<br>Todo Created: ${created.length}`;
            }
            if (completed.length > 0) {
                content += `<br>Todo Completed: ${completed.length}`;
            }
        } else if (this.currentMode === 'memo') {
            const memos = this.getMemosCreatedOnDate(date);
            if (memos.length > 0) {
                content += `<br>Memos: ${memos.length}`;
            }
        } else if (this.currentMode === 'counter') {
            const counters = this.getCountersForDate(date);
            if (counters.length > 0) {
                content += '<br>Counters:';
                counters.forEach(counter => {
                    content += `<br>• ${counter.title}`;
                });
            }
        }
        
        return content;
    }
    
    updateTooltipPosition(e) {
        const tooltip = document.getElementById('tooltip');
        const tooltipRect = tooltip.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        let left = e.pageX + 10;
        let top = e.pageY - 30;
        
        if (left + tooltipRect.width > viewportWidth) {
            left = e.pageX - tooltipRect.width - 10;
        }
        
        if (left < 0) {
            left = 10;
        }
        
        if (top < 0) {
            top = e.pageY + 20;
        }
        
        if (top + tooltipRect.height > viewportHeight) {
            top = e.pageY - tooltipRect.height - 10;
        }
        
        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';
    }
    
    hideTooltip() {
        document.getElementById('tooltip').style.display = 'none';
    }// 일정 관리
    showScheduleModal(date = null) {
        this.currentSelectedDate = date;
        const modal = document.getElementById('scheduleModal');
        const title = document.getElementById('scheduleModalTitle');
        const textInput = document.getElementById('scheduleText');
        const endDateInput = document.getElementById('scheduleEndDate');
        const skipWeekendsInput = document.getElementById('scheduleSkipWeekends');
        
        if (date) {
            const formattedDate = date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            title.textContent = `Add Schedule - ${formattedDate}`;
            
            // 선택된 날짜를 정확히 설정 (시간대 문제 해결)
            const dateKey = this.getDateKey(date);
            endDateInput.value = dateKey;
            endDateInput.min = dateKey;
        } else {
            title.textContent = 'Add Schedule';
            const today = new Date();
            const todayKey = this.getDateKey(today);
            endDateInput.value = todayKey;
            endDateInput.min = todayKey;
        }
        
        textInput.value = '';
        skipWeekendsInput.checked = false;
        
        modal.style.display = 'flex';
        textInput.focus();
    }
    
    hideScheduleModal() {
        document.getElementById('scheduleModal').style.display = 'none';
        this.currentSelectedDate = null;
        this.currentEditingSchedule = null;
    }
    
    confirmScheduleModal() {
        const textInput = document.getElementById('scheduleText');
        const endDateInput = document.getElementById('scheduleEndDate');
        const skipWeekendsInput = document.getElementById('scheduleSkipWeekends');
        
        const content = textInput.value.trim();
        const endDate = endDateInput.value;
        const skipWeekends = skipWeekendsInput.checked;
        
        if (!content) {
            this.showToast('Please enter schedule content.', 'error');
            return;
        }
        
        if (!endDate) {
            this.showToast('Please select an end date.', 'error');
            return;
        }
        
        // 시작일 결정 - 날짜 키 형식으로 정확히 저장
        const startDate = this.currentSelectedDate ? 
            this.getDateKey(this.currentSelectedDate) : 
            endDate;
        
        // 날짜 비교를 위해 Date 객체로 변환
        const startDateObj = new Date(startDate + 'T00:00:00');
        const endDateObj = new Date(endDate + 'T00:00:00');
        
        if (startDateObj > endDateObj) {
            this.showToast('End date cannot be earlier than start date.', 'error');
            return;
        }
        
        const schedule = {
            id: Date.now(),
            title: content,
            startDate: startDate, // "YYYY-MM-DD" 형식으로 저장
            endDate: endDate,     // "YYYY-MM-DD" 형식으로 저장
            skipWeekends: skipWeekends,
            createdAt: this.formatDateTime(new Date())
        };
        
        // 유효한 날짜들을 미리 계산해서 저장
        schedule.validDates = this.calculateValidScheduleDates(schedule);
        
        this.schedulesData.push(schedule);
        this.saveData();
        this.renderCalendar();
        if (this.currentMode === 'schedule') {
            this.renderMonthlyCalendar();
        }
        this.updateModeStats();
        this.hideScheduleModal();
        this.showToast('Schedule created successfully!', 'success');
    }
    
    // 날짜 유효성 검사 함수 추가
    isValidDate(dateString) {
        const regex = /^\d{4}-\d{2}-\d{2}$/;
        if (!regex.test(dateString)) return false;
        
        const date = new Date(dateString + 'T00:00:00');
        return date.toISOString().split('T')[0] === dateString;
    }
    
    getSchedulesForDate(date) {
        const dateStr = this.getDateKey(date);
        return this.schedulesData.filter(schedule => {
            // 유효한 날짜 목록이 없으면 계산
            if (!schedule.validDates) {
                schedule.validDates = this.calculateValidScheduleDates(schedule);
            }
            
            // 유효한 날짜 목록에 포함되어 있는지 확인
            return schedule.validDates.includes(dateStr);
        });
    }

    renderMonthlyCalendar() {
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                           'July', 'August', 'September', 'October', 'November', 'December'];
        
        document.getElementById('currentMonthYear').textContent = 
            `${monthNames[this.currentMonth]} ${this.currentYear}`;
        
        const tbody = document.getElementById('monthlyCalendarBody');
        tbody.innerHTML = '';
        
        const firstDay = new Date(this.currentYear, this.currentMonth, 1);
        const lastDay = new Date(this.currentYear, this.currentMonth + 1, 0);
        
        const startDate = new Date(firstDay);
        startDate.setDate(firstDay.getDate() - firstDay.getDay());
        
        const endDate = new Date(lastDay);
        endDate.setDate(lastDay.getDate() + (6 - lastDay.getDay()));
        
        let currentDate = new Date(startDate);
        const today = new Date();
        
        while (currentDate <= endDate) {
            const row = document.createElement('tr');
            
            for (let day = 0; day < 7; day++) {
                const cell = document.createElement('td');
                
                const dayContainer = document.createElement('div');
                dayContainer.className = 'calendar-day-container';
                
                const dayNum = document.createElement('div');
                dayNum.className = 'calendar-day-num';
                dayNum.textContent = currentDate.getDate();
                
                const isToday = currentDate.toDateString() === today.toDateString();
                
                if (currentDate.getMonth() !== this.currentMonth) {
                    dayNum.classList.add('other-month');
                } else {
                    const capturedDate = new Date(currentDate);
                    
                    cell.addEventListener('click', () => {
                        this.showScheduleModal(capturedDate);
                    });
                    
                    if (isToday) {
                        dayNum.classList.add('today');
                    }
                }
                
                dayContainer.appendChild(dayNum);
                cell.appendChild(dayContainer);
                
                // 일정 목록 표시
                const schedules = this.getSchedulesForDate(currentDate);
                if (schedules.length > 0) {
                    const scheduleList = document.createElement('div');
                    scheduleList.className = 'calendar-schedule-list';
                    
                    schedules.forEach(schedule => {
                        const scheduleItem = document.createElement('div');
                        scheduleItem.className = 'calendar-schedule-item';
                        
                        if (schedule.startDate === schedule.endDate) {
                            scheduleItem.textContent = schedule.title;
                        } else {
                            const dateInfo = this.getScheduleDateIndex(schedule, currentDate);
                            if (dateInfo.isValid) {
                                scheduleItem.textContent = `${schedule.title} (${dateInfo.currentIndex}/${dateInfo.totalCount})`;
                            } else {
                                scheduleItem.textContent = schedule.title;
                            }
                        }
                        
                        scheduleList.appendChild(scheduleItem);
                    });
                    
                    cell.appendChild(scheduleList);
                }
                
                row.appendChild(cell);
                currentDate.setDate(currentDate.getDate() + 1);
            }
            
            tbody.appendChild(row);
        }
    }
    
    showAllSchedulesModal() {
        const modal = document.getElementById('allSchedulesModal');
        const searchInput = document.getElementById('scheduleSearchInput');
        
        searchInput.value = '';
        this.currentScheduleSearch = '';
        
        this.renderAllSchedulesList();
        modal.style.display = 'flex';
    }
    
    hideAllSchedulesModal() {
        document.getElementById('allSchedulesModal').style.display = 'none';
    }
    
    renderAllSchedulesList() {
        const container = document.getElementById('allSchedulesList');
        container.innerHTML = '';
    
        let filteredSchedules = this.schedulesData;
    
        if (this.currentScheduleSearch) {
            filteredSchedules = this.schedulesData.filter(schedule => 
                schedule.title.toLowerCase().includes(this.currentScheduleSearch.toLowerCase())
            );
        }
    
        if (filteredSchedules.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'empty-state';
            emptyState.innerHTML = `
                <h3>No schedules found</h3>
                <p>${this.currentScheduleSearch ? 'Try a different search term' : 'Create your first schedule'}</p>
            `;
            container.appendChild(emptyState);
            return;
        }
    
        const sortedSchedules = [...filteredSchedules].sort((a, b) => 
            new Date(a.startDate) - new Date(b.startDate)
        );
    
        sortedSchedules.forEach(schedule => {
            const item = document.createElement('div');
            item.className = 'schedule-item';
        
            const startDate = new Date(schedule.startDate);
            const endDate = new Date(schedule.endDate);
            const dateText = schedule.startDate === schedule.endDate ? 
                startDate.toLocaleDateString() : 
                `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`;
        
            item.innerHTML = `
                <div class="schedule-item-info">
                    <div class="schedule-item-title">${schedule.title}</div>
                    <div class="schedule-item-date">${dateText}</div>
                    <div class="schedule-item-created">Created: ${schedule.createdAt}</div>
                </div>
                <div class="schedule-item-controls">
                    <button class="schedule-edit-btn">Edit</button>
                    <button class="schedule-delete-btn">Delete</button>
                </div>
            `;
        
            // 이벤트 리스너를 동적으로 추가
            const editBtn = item.querySelector('.schedule-edit-btn');
            const deleteBtn = item.querySelector('.schedule-delete-btn');
        
            editBtn.addEventListener('click', () => {
                this.editSchedule(schedule.id);
            });
        
            deleteBtn.addEventListener('click', () => {
                this.deleteSchedule(schedule.id);
            });
        
            container.appendChild(item);
        });
    }
    
    searchSchedules() {
        const searchInput = document.getElementById('scheduleSearchInput');
        this.currentScheduleSearch = searchInput.value.trim();
        this.renderAllSchedulesList();
    }
    
    editSchedule(id) {
        const schedule = this.schedulesData.find(s => s.id === id);
        if (!schedule) return;
        
        this.showScheduleEditModal(schedule);
    }
    
    deleteSchedule(id) {
        this.showConfirmModal(
            'Delete Schedule',
            'Are you sure you want to delete this schedule?',
            () => {
                this.schedulesData = this.schedulesData.filter(s => s.id !== id);
                this.saveData();
                this.renderAllSchedulesList();
                this.renderCalendar();
                if (this.currentMode === 'schedule') {
                    this.renderMonthlyCalendar();
                }
                this.updateModeStats();
                this.showToast('Schedule deleted successfully!', 'success');
            }
        );
    }// 투두리스트 관리
    switchTodoTab(tab) {
        this.activeTab = tab;
        
        const todoTab = document.getElementById('todoTabActive');
        const completedTab = document.getElementById('todoTabCompleted');
        const todoContent = document.getElementById('todoTabContent');
        const completedContent = document.getElementById('completedTabContent');
        
        if (tab === 'todo') {
            todoTab.classList.add('active');
            completedTab.classList.remove('active');
            todoContent.style.display = 'flex';
            todoContent.style.flexDirection = 'column';
            completedContent.style.display = 'none';
        } else {
            todoTab.classList.remove('active');
            completedTab.classList.add('active');
            todoContent.style.display = 'none';
            completedContent.style.display = 'flex';
            completedContent.style.flexDirection = 'column';
        }
        
        // 통계 업데이트
        this.updateModeStats();
        this.renderCalendar();
    }
    
    addTodo() {
        const input = document.getElementById('todoInput');
        const text = input.value.trim();
        
        if (text) {
            const now = new Date();
            const todo = {
                id: Date.now(),
                text: text,
                completed: false,
                createdAt: this.formatDateTime(now),
                completedAt: null,
                editedAt: null
            };
            this.todoData.push(todo);
            input.value = '';
            this.saveData();
            this.renderTodoList();
            this.renderCalendar();
            this.updateModeStats();
            this.showToast('Todo created successfully!', 'success');
        }
    }
    
    renderTodoList() {
        const todoList = document.getElementById('todoList');
        const completedList = document.getElementById('completedList');
        const todoClearBtn = document.getElementById('todoClearBtn');
        const completedClearBtn = document.getElementById('completedClearBtn');
        
        // 필터링된 데이터 가져오기
        let filteredTodoData = this.todoData;
        let filteredCompletedData = this.completedData;
        
        if (this.currentTodoFilter) {
            const filterDate = this.currentTodoFilter;
            
            filteredTodoData = this.todoData.filter(todo => {
                const createdDate = new Date(todo.createdAt).toISOString().split('T')[0];
                return createdDate === filterDate;
            });
            
            filteredCompletedData = this.completedData.filter(todo => {
                if (!todo.completedAt) return false;
                const completedDate = new Date(todo.completedAt).toISOString().split('T')[0];
                return completedDate === filterDate;
            });
        }
        
        // Todo 목록 렌더링
        todoList.innerHTML = '';
        todoClearBtn.style.display = this.todoData.length > 0 ? 'block' : 'none';
        
        if (filteredTodoData.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'empty-state';
            emptyState.innerHTML = `
                <h3>No tasks</h3>
                <p>${this.currentTodoFilter ? 'No tasks found for selected date' : 'Add your first task above'}</p>
            `;
            todoList.appendChild(emptyState);
        } else {
            filteredTodoData.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            
            filteredTodoData.forEach(todo => {
                const item = document.createElement('div');
                item.className = 'todo-item';
                
                const timestampHtml = todo.editedAt ? 
                    `<div class="todo-timestamp">Created: ${todo.createdAt}<br>Edited: ${todo.editedAt}</div>` :
                    `<div class="todo-timestamp">Created: ${todo.createdAt}</div>`;
                
                const isEditing = this.currentTodoEditId === todo.id;
                
                item.innerHTML = `
                    <div class="todo-item-content">
                        <textarea class="todo-text ${isEditing ? 'editing' : ''}" ${isEditing ? '' : 'readonly'}>${todo.text}</textarea>
                        ${timestampHtml}
                    </div>
                    <div class="todo-controls">
                        <button class="todo-btn ${isEditing ? 'complete' : 'edit'}" onclick="attendanceChecker.toggleTodoEdit(${todo.id}, this)">${isEditing ? 'Save' : 'Edit'}</button>
                        <button class="todo-btn complete" onclick="attendanceChecker.completeTodo(${todo.id})">Complete</button>
                        <button class="todo-btn delete" onclick="attendanceChecker.deleteTodo(${todo.id})">Delete</button>
                    </div>
                `;
                todoList.appendChild(item);
                
                // 편집 모드일 때 포커스 유지
                if (isEditing) {
                    setTimeout(() => {
                        const textArea = item.querySelector('.todo-text');
                        textArea.focus();
                        textArea.setSelectionRange(textArea.value.length, textArea.value.length);
                    }, 0);
                }
            });
        }
        
        // Completed 목록 렌더링 - 수정된 부분 (시간 순서 변경: Completed → Edited → Created)
        completedList.innerHTML = '';
        completedClearBtn.style.display = this.completedData.length > 0 ? 'block' : 'none';
        
        if (filteredCompletedData.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'empty-state';
            emptyState.innerHTML = `
                <h3>No completed tasks</h3>
                <p>${this.currentTodoFilter ? 'No completed tasks for selected date' : 'Complete some tasks to see them here'}</p>
            `;
            completedList.appendChild(emptyState);
        } else {
            filteredCompletedData.sort((a, b) => {
                if (!a.completedAt || !b.completedAt) return 0;
                return new Date(b.completedAt) - new Date(a.completedAt);
            });
            
            filteredCompletedData.forEach(todo => {
                const item = document.createElement('div');
                item.className = 'todo-item completed';
                
                // 수정된 부분: 시간 순서를 completed, edited, created로 변경
                let timestampHtml = `<div class="todo-timestamp">`;
                if (todo.completedAt) {
                    timestampHtml += `Completed: ${todo.completedAt}`;
                }
                if (todo.editedAt) {
                    timestampHtml += `<br>Edited: ${todo.editedAt}`;
                }
                timestampHtml += `<br>Created: ${todo.createdAt}`;
                timestampHtml += `</div>`;
                
                item.innerHTML = `
                    <div class="todo-item-content">
                        <div class="todo-text">${todo.text}</div>
                        ${timestampHtml}
                    </div>
                    <div class="todo-controls">
                        <button class="todo-btn edit" onclick="attendanceChecker.restoreTodo(${todo.id})">Restore</button>
                        <button class="todo-btn delete" onclick="attendanceChecker.deleteTodo(${todo.id}, true)">Delete</button>
                    </div>
                `;
                completedList.appendChild(item);
            });
        }
    }
    
    toggleTodoEdit(id, element) {
        if (this.currentTodoEditId === id) {
            // 저장 모드
            const todo = this.todoData.find(t => t.id === id);
            if (todo) {
                const textElement = element.parentElement.parentElement.querySelector('.todo-text');
                const newText = textElement.value.trim();
                if (newText && todo.text !== newText) {
                    todo.text = newText;
                    todo.editedAt = this.formatDateTime(new Date());
                    this.saveData();
                    this.showToast('Todo updated successfully!', 'success');
                }
            }
            this.currentTodoEditId = null;
        } else {
            // 편집 모드로 전환
            this.currentTodoEditId = id;
        }
        this.renderTodoList();
    }
    
    editTodo(id, newText) {
        const todo = this.todoData.find(t => t.id === id);
        if (todo && todo.text !== newText) {
            todo.text = newText;
            todo.editedAt = this.formatDateTime(new Date());
            this.saveData();
        }
    }
    
    completeTodo(id) {
        const todoIndex = this.todoData.findIndex(t => t.id === id);
        if (todoIndex !== -1) {
            const todo = this.todoData.splice(todoIndex, 1)[0];
            todo.completed = true;
            todo.completedAt = this.formatDateTime(new Date());
            this.completedData.push(todo);
            this.currentTodoEditId = null; // 편집 상태 해제
            this.saveData();
            this.renderTodoList();
            this.renderCalendar();
            this.updateModeStats();
            this.showToast('Todo completed!', 'success');
        }
    }
    
    restoreTodo(id) {
        const completedIndex = this.completedData.findIndex(t => t.id === id);
        if (completedIndex !== -1) {
            const todo = this.completedData.splice(completedIndex, 1)[0];
            todo.completed = false;
            todo.completedAt = null;
            this.todoData.push(todo);
            this.saveData();
            this.renderTodoList();
            this.renderCalendar();
            this.updateModeStats();
            this.showToast('Todo restored!', 'success');
        }
    }
    
    deleteTodo(id, isCompleted = false) {
        this.showConfirmModal(
            'Delete Todo',
            'Are you sure you want to delete this task?',
            () => {
                if (isCompleted) {
                    this.completedData = this.completedData.filter(t => t.id !== id);
                } else {
                    this.todoData = this.todoData.filter(t => t.id !== id);
                    if (this.currentTodoEditId === id) {
                        this.currentTodoEditId = null;
                    }
                }
                this.saveData();
                this.renderTodoList();
                this.renderCalendar();
                this.updateModeStats();
                this.showToast('Todo deleted!', 'success');
            }
        );
    }
    
    getTodosCreatedOnDate(date) {
        const dateStr = this.getDateKey(date);
        return this.todoData.filter(todo => {
            const createdDate = new Date(todo.createdAt).toISOString().split('T')[0];
            return createdDate === dateStr;
        });
    }
    
    getTodosCompletedOnDate(date) {
        const dateStr = this.getDateKey(date);
        return this.completedData.filter(todo => {
            if (!todo.completedAt) return false;
            const completedDate = new Date(todo.completedAt).toISOString().split('T')[0];
            return completedDate === dateStr;
        });
    }// 메모 관리
    showMemoModal(memoId = null) {
        const modal = document.getElementById('memoModal');
        const titleInput = document.getElementById('memoTitleInput');
        const contentInput = document.getElementById('memoContentInput');
        const timestampDiv = document.getElementById('memoTimestamp');
        const editBtn = document.getElementById('memoModalEdit');
        const confirmBtn = document.getElementById('memoModalConfirm');
    
        this.currentEditingMemo = memoId;
        this.memoEditMode = false; // 편집 모드 상태 추가
        this.originalMemoData = null; // 원본 데이터 저장용
    
        if (memoId) {
            const memo = this.memoData.find(m => m.id === memoId);
            if (memo) {
                // 원본 데이터 백업
                this.originalMemoData = {
                    title: memo.title,
                    content: memo.content
                };
            
                titleInput.value = memo.title;
                contentInput.value = memo.content;
                contentInput.readOnly = true;
                titleInput.readOnly = true;
            
                const timestampHtml = memo.editedAt ? 
                    `Created at ${memo.createdAt}<br>Edited at ${memo.editedAt}` :
                    `Created at ${memo.createdAt}`;
                timestampDiv.innerHTML = timestampHtml;
            
                editBtn.style.display = 'inline-block';
                editBtn.textContent = 'Edit';
                confirmBtn.style.display = 'none'; // 기존 메모 보기 시 아래쪽 Save 버튼 숨김
            }
        } else {
            // 새 메모 생성 시에만 아래쪽 Save 버튼 표시
            const nextNumber = this.memoData.length + 1;
            titleInput.value = `Memo ${nextNumber}`;
            contentInput.value = '';
            contentInput.readOnly = false;
            titleInput.readOnly = false;
            timestampDiv.innerHTML = '';
        
            editBtn.style.display = 'none';
            confirmBtn.style.display = 'inline-block'; // 새 메모 시에만 아래쪽 Save 표시
            this.memoEditMode = false;
            this.originalMemoData = null;
        
            setTimeout(() => {
                titleInput.focus();
                titleInput.select();
            }, 100);
        }
    
        modal.style.display = 'flex';
    }
    
    hideMemoModal() {
        // 편집 모드에서 닫으려고 할 때 확인
        if (this.memoEditMode && this.hasUnsavedMemoChanges()) {
            this.showMemoCloseConfirm();
            return;
        }
    
        this.closeMemoModal();
    }

    // 새로운 함수: 메모 모달 닫기 확인
    showMemoCloseConfirm() {
        this.showConfirmModal(
            'Unsaved Changes',
            'You have unsaved changes. Close without saving?',
            () => {
                this.revertMemoChanges();
                this.closeMemoModal();
            }
        );
    }

    // 새로운 함수: 메모 변경사항 되돌리기
    revertMemoChanges() {
        if (this.originalMemoData) {
            const titleInput = document.getElementById('memoTitleInput');
            const contentInput = document.getElementById('memoContentInput');
            const editBtn = document.getElementById('memoModalEdit');
            const confirmBtn = document.getElementById('memoModalConfirm');
        
            titleInput.value = this.originalMemoData.title;
            contentInput.value = this.originalMemoData.content;
            titleInput.readOnly = true;
            contentInput.readOnly = true;
            editBtn.textContent = 'Edit';
            confirmBtn.style.display = 'none'; // 되돌릴 때도 아래쪽 Save 숨김
            this.memoEditMode = false;
        }
    }

    // 새로운 함수: 실제 메모 모달 닫기
    closeMemoModal() {
        document.getElementById('memoModal').style.display = 'none';
        this.currentEditingMemo = null;
        this.memoEditMode = false;
        this.originalMemoData = null;
    }

    // 새로운 함수: 저장되지 않은 변경사항 확인
    hasUnsavedMemoChanges() {
        if (!this.originalMemoData) return false;
    
        const titleInput = document.getElementById('memoTitleInput');
        const contentInput = document.getElementById('memoContentInput');
    
        return titleInput.value !== this.originalMemoData.title || 
            contentInput.value !== this.originalMemoData.content;
    }
    
    toggleMemoEdit() {
        const titleInput = document.getElementById('memoTitleInput');
        const contentInput = document.getElementById('memoContentInput');
        const editBtn = document.getElementById('memoModalEdit');
        const confirmBtn = document.getElementById('memoModalConfirm');
    
        if (!this.memoEditMode) {
            // 편집 모드 시작
            titleInput.readOnly = false;
            contentInput.readOnly = false;
            contentInput.focus();
            editBtn.textContent = 'Save';
            confirmBtn.style.display = 'none'; // 아래쪽 Save 버튼 숨기기
            this.memoEditMode = true;
        } else {
            // 저장 모드
            this.saveMemoEdit();
            titleInput.readOnly = true;
            contentInput.readOnly = true;
            editBtn.textContent = 'Edit';
            confirmBtn.style.display = 'none'; // 아래쪽 Save 버튼 계속 숨김
            this.memoEditMode = false;
        }
    }
    
    saveMemoEdit() {
        if (!this.currentEditingMemo) return;
        
        const titleInput = document.getElementById('memoTitleInput');
        const contentInput = document.getElementById('memoContentInput');
        const timestampDiv = document.getElementById('memoTimestamp');
        
        const memo = this.memoData.find(m => m.id === this.currentEditingMemo);
        if (memo) {
            memo.title = titleInput.value.trim() || memo.title;
            memo.content = contentInput.value.trim();
            memo.editedAt = this.formatDateTime(new Date());
            
            const timestampHtml = `Created at ${memo.createdAt}<br>Edited at ${memo.editedAt}`;
            timestampDiv.innerHTML = timestampHtml;
            
            this.saveData();
            this.renderMemoList();
            this.renderCalendar();
            this.showToast('Memo updated successfully!', 'success');
        }
    }
    
    confirmMemoModal() {
        const titleInput = document.getElementById('memoTitleInput');
        const contentInput = document.getElementById('memoContentInput');
        
        const title = titleInput.value.trim();
        const content = contentInput.value.trim();
        
        if (!content) {
            this.showToast('Please enter memo content.', 'error');
            return;
        }
        
        if (this.currentEditingMemo) {
            this.saveMemoEdit();
        } else {
            const now = new Date();
            const memo = {
                id: Date.now(),
                title: title || `Memo ${this.memoData.length + 1}`,
                content: content,
                createdAt: this.formatDateTime(now),
                editedAt: null
            };
            this.memoData.push(memo);
            this.saveData();
            this.renderMemoList();
            this.renderCalendar();
            this.updateModeStats();
            this.showToast('Memo created successfully!', 'success');
        }
        
        this.hideMemoModal();
    }
    
    searchMemos() {
        const searchInput = document.getElementById('memoSearchInput');
        const searchTerm = searchInput.value.trim().toLowerCase();
        
        if (searchTerm) {
            this.currentMemoSearch = searchTerm;
            document.getElementById('memoClearSearchBtn').style.display = 'inline-block';
        } else {
            this.currentMemoSearch = '';
            document.getElementById('memoClearSearchBtn').style.display = 'none';
        }
        
        this.renderMemoList();
    }
    
    clearMemoSearch() {
        document.getElementById('memoSearchInput').value = '';
        this.currentMemoSearch = '';
        document.getElementById('memoClearSearchBtn').style.display = 'none';
        this.renderMemoList();
    }
    

// renderMemoList() 함수를 다음과 같이 교체하세요 (script.js 파일에서)

    renderMemoList() {
        const memoList = document.getElementById('memoList');
        const memoClearBtn = document.getElementById('memoClearBtn');
    
        if (!memoList) {
            console.error('memoList element not found');
            return;
        }
    
        memoList.innerHTML = '';
    
        // 데이터 타입 확인
        if (!Array.isArray(this.memoData)) {
            console.error('memoData is not an array:', typeof this.memoData);
            this.memoData = [];
        }
    
        let filteredMemos = [...this.memoData];
    
        if (this.currentMemoFilter) {
            const filterDate = this.currentMemoFilter;
            filteredMemos = this.memoData.filter(memo => {
                if (!memo || !memo.createdAt) return false;
                const createdDate = new Date(memo.createdAt).toISOString().split('T')[0];
                return createdDate === filterDate;
            });
        } else if (this.currentMemoSearch) {
            filteredMemos = this.memoData.filter(memo => {
                if (!memo || !memo.title || !memo.content) return false;
                return memo.title.toLowerCase().includes(this.currentMemoSearch) ||
                    memo.content.toLowerCase().includes(this.currentMemoSearch);
            });
        }
    
        if (memoClearBtn) {
            memoClearBtn.style.display = this.memoData.length > 0 ? 'block' : 'none';
        }
    
        if (filteredMemos.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'empty-state';
        
            if (this.currentMemoSearch) {
                emptyState.innerHTML = `
                    <h3>No memos found</h3>
                    <p>No memos found for "${this.currentMemoSearch}"</p>
                `;
            } else if (this.currentMemoFilter) {
                emptyState.innerHTML = `
                    <h3>No memos found</h3>
                    <p>No memos found for the selected date</p>
                `;
            } else {
                emptyState.innerHTML = `
                    <h3>No memos yet</h3>
                    <p>Create your first memo to get started!</p>
                `;
            }
            memoList.appendChild(emptyState);
        } else {
            // 정렬 - 최신순
            filteredMemos.sort((a, b) => {
                if (!a.createdAt || !b.createdAt) return 0;
                return new Date(b.createdAt) - new Date(a.createdAt);
            });
        
            filteredMemos.forEach(memo => {
                if (!memo || !memo.id) return;
            
                const item = document.createElement('div');
                item.className = 'memo-item';
            
                const timestampHtml = memo.editedAt ? 
                    `Created at ${memo.createdAt}<br>Edited at ${memo.editedAt}` :
                    `Created at ${memo.createdAt}`;
            
                const preview = memo.content && memo.content.length > 100 ? 
                    memo.content.substring(0, 100) + '...' : 
                    (memo.content || '');
            
                let highlightedTitle = memo.title || 'Untitled';
                let highlightedPreview = preview;
            
                if (this.currentMemoSearch) {
                    const regex = new RegExp(`(${this.currentMemoSearch})`, 'gi');
                    highlightedTitle = highlightedTitle.replace(regex, '<span style="background: rgba(255, 255, 0, 0.3);">$1</span>');
                    highlightedPreview = highlightedPreview.replace(regex, '<span style="background: rgba(255, 255, 0, 0.3);">$1</span>');
                }
            
                // 아이템 구조를 todo/counter와 동일하게 변경 (클래스명 수정)
                item.innerHTML = `
                    <div class="memo-item-content">
                        <div class="memo-title">${highlightedTitle}</div>
                        <div class="memo-preview">${highlightedPreview}</div>
                        <div class="memo-timestamp">${timestampHtml}</div>
                    </div>
                    <div class="memo-item-controls">
                        <button class="memo-btn delete" onclick="attendanceChecker.deleteMemo(${memo.id})">Delete</button>
                    </div>
                `;
            
                item.addEventListener('click', (e) => {
                    if (e.target.classList.contains('memo-btn')) return;
                    this.showMemoModal(memo.id);
                });
            
                memoList.appendChild(item);
            });
        }
    }
    
    deleteMemo(id) {
        this.showConfirmModal(
            'Delete Memo',
            'Are you sure you want to delete this memo?',
            () => {
                this.memoData = this.memoData.filter(m => m.id !== id);
                this.saveData();
                this.renderMemoList();
                this.renderCalendar();
                this.updateModeStats();
                this.showToast('Memo deleted successfully!', 'success');
            }
        );
    }
    
    getMemosCreatedOnDate(date) {
        const dateStr = this.getDateKey(date);
        
        // 데이터 타입 확인
        if (!Array.isArray(this.memoData)) {
            console.warn('memoData is not an array in getMemosCreatedOnDate');
            return [];
        }
        
        return this.memoData.filter(memo => {
            if (!memo || !memo.createdAt) return false;
            try {
                const createdDate = new Date(memo.createdAt).toISOString().split('T')[0];
                return createdDate === dateStr;
            } catch (error) {
                console.error('Error parsing memo date:', error);
                return false;
            }
        });
    }// Day Counter 관리
    showCounterModal(counterId = null) {
        const modal = document.getElementById('counterModal');
        const title = document.getElementById('counterModalTitle');
        const titleInput = document.getElementById('counterTitle');
        const dateInput = document.getElementById('counterDate');
        const confirmBtn = document.getElementById('counterModalConfirm');
        
        this.currentEditingCounter = counterId;
        
        if (counterId) {
            const counter = this.counterData.find(c => c.id === counterId);
            if (counter) {
                title.textContent = 'Edit Day Counter';
                titleInput.value = counter.title;
                dateInput.value = counter.targetDate;
                confirmBtn.textContent = 'Update';
            }
        } else {
            title.textContent = 'Create Day Counter';
            titleInput.value = '';
            dateInput.value = new Date().toISOString().split('T')[0];
            confirmBtn.textContent = 'Create';
            
            setTimeout(() => {
                titleInput.focus();
            }, 100);
        }
        
        modal.style.display = 'flex';
    }
    
    hideCounterModal() {
        document.getElementById('counterModal').style.display = 'none';
        this.currentEditingCounter = null;
    }
    
    confirmCounterModal() {
        const titleInput = document.getElementById('counterTitle');
        const dateInput = document.getElementById('counterDate');
        
        const title = titleInput.value.trim();
        const targetDate = dateInput.value;
        
        if (!title || !targetDate) {
            this.showToast('Please fill in both title and target date.', 'error');
            return;
        }
        
        if (this.currentEditingCounter) {
            const counter = this.counterData.find(c => c.id === this.currentEditingCounter);
            if (counter) {
                counter.title = title;
                counter.targetDate = targetDate;
                counter.editedAt = this.formatDateTime(new Date());
                this.showToast('Counter updated successfully!', 'success');
            }
        } else {
            const now = new Date();
            const counter = {
                id: Date.now(),
                title: title,
                targetDate: targetDate,
                createdAt: this.formatDateTime(now),
                editedAt: null
            };
            this.counterData.push(counter);
            this.showToast('Counter created successfully!', 'success');
        }
        
        this.saveData();
        this.renderCounterList();
        this.renderCalendar();
        this.updateModeStats();
        this.hideCounterModal();
    }
    
    renderCounterList() {
        const counterList = document.getElementById('counterList');
        const counterClearBtn = document.getElementById('counterClearBtn');
        
        counterList.innerHTML = '';
        
        let filteredCounters = this.counterData;
        
        if (this.currentCounterFilter) {
            const filterDate = this.currentCounterFilter;
            filteredCounters = this.counterData.filter(counter => {
                return counter.targetDate === filterDate;
            });
        }
        
        counterClearBtn.style.display = this.counterData.length > 0 ? 'block' : 'none';
        
        if (filteredCounters.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'empty-state';
            
            if (this.currentCounterFilter) {
                emptyState.innerHTML = `
                    <h3>No day counters found</h3>
                    <p>No day counters found for the selected date</p>
                `;
            } else {
                emptyState.innerHTML = `
                    <h3>No day counters yet</h3>
                    <p>Create your first day counter to track important dates!</p>
                `;
            }
            counterList.appendChild(emptyState);
        } else {
            filteredCounters.sort((a, b) => {
                const aDays = Math.abs(this.calculateDaysDifference(a.targetDate));
                const bDays = Math.abs(this.calculateDaysDifference(b.targetDate));
                return aDays - bDays;
            });
            
            filteredCounters.forEach(counter => {
                const item = document.createElement('div');
                item.className = 'counter-item';
                
                const daysDiff = this.calculateDaysDifference(counter.targetDate);
                const daysText = this.formatDaysText(daysDiff);
                
                let daysClass = 'future';
                let statusIcon = '🔮';
                
                if (daysDiff === 0) {
                    daysClass = 'today';
                    statusIcon = '🎯';
                    item.classList.add('today');
                } else if (daysDiff < 0) {
                    daysClass = 'past';
                    statusIcon = '📝';
                } else {
                    if (daysDiff <= 3) {
                        daysClass = 'urgent';
                        statusIcon = '⚠️';
                    }
                }
                
                const targetDate = new Date(counter.targetDate);
                const dateText = targetDate.toLocaleDateString();
                
                item.innerHTML = `
                    <div class="counter-info">
                        <div class="counter-title">${counter.title}</div>
                        <div class="counter-date">${dateText}</div>
                        <div class="counter-days ${daysClass}">
                            ${daysText}
                            <span class="counter-status-icon">${statusIcon}</span>
                        </div>
                    </div>
                    <div class="counter-item-controls">
                        <button class="counter-btn edit" onclick="attendanceChecker.editCounter(${counter.id})">Edit</button>
                        <button class="counter-btn delete" onclick="attendanceChecker.deleteCounter(${counter.id})">Delete</button>
                    </div>
                `;
                
                counterList.appendChild(item);
            });
        }
    }
    
    calculateDaysDifference(targetDate) {
        const today = new Date();
        const target = new Date(targetDate);
        
        today.setHours(0, 0, 0, 0);
        target.setHours(0, 0, 0, 0);
        
        const diffTime = target - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        return diffDays;
    }
    
    formatDaysText(days) {
        if (days === 0) {
            return 'Today';
        } else if (days > 0) {
            return `-${days} days left`;
        } else {
            return `+${Math.abs(days)} days ago`;
        }
    }
    
    editCounter(id) {
        this.showCounterModal(id);
    }
    
    deleteCounter(id) {
        this.showConfirmModal(
            'Delete Counter',
            'Are you sure you want to delete this day counter?',
            () => {
                this.counterData = this.counterData.filter(c => c.id !== id);
                this.saveData();
                this.renderCounterList();
                this.renderCalendar();
                this.updateModeStats();
                this.showToast('Counter deleted successfully!', 'success');
            }
        );
    }
    
    getCountersForDate(date) {
        const dateStr = this.getDateKey(date);
        return this.counterData.filter(counter => {
            return counter.targetDate === dateStr;
        });
    }
    
    // 필터 관리
    setTodoFilter(dateKey) {
        this.currentTodoFilter = dateKey;
        this.showTodoFilter(dateKey);
    }
    
    setMemoFilter(dateKey) {
        this.currentMemoFilter = dateKey;
        this.showMemoFilter(dateKey);
    }
    
    setCounterFilter(dateKey) {
        this.currentCounterFilter = dateKey;
        this.showCounterFilter(dateKey);
    }
    
    showTodoFilter(dateKey) {
        const filterDisplay = document.getElementById('todoFilterDisplay');
        const filterText = document.getElementById('todoFilterText');
        
        const date = new Date(dateKey);
        const formattedDate = date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        filterText.textContent = formattedDate;
        filterDisplay.style.display = 'flex';
        
        this.renderTodoList();
    }
    
    showMemoFilter(dateKey) {
        const filterDisplay = document.getElementById('memoFilterDisplay');
        const filterText = document.getElementById('memoFilterText');
        
        const date = new Date(dateKey);
        const formattedDate = date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        filterText.textContent = formattedDate;
        filterDisplay.style.display = 'flex';
        
        this.renderMemoList();
    }
    
    showCounterFilter(dateKey) {
        const filterDisplay = document.getElementById('counterFilterDisplay');
        const filterText = document.getElementById('counterFilterText');
        
        const date = new Date(dateKey);
        const formattedDate = date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        filterText.textContent = formattedDate;
        filterDisplay.style.display = 'flex';
        
        this.renderCounterList();
    }
    
    clearTodoFilter() {
        this.currentTodoFilter = null;
        document.getElementById('todoFilterDisplay').style.display = 'none';
        this.renderTodoList();
    }
    
    clearMemoFilter() {
        this.currentMemoFilter = null;
        document.getElementById('memoFilterDisplay').style.display = 'none';
        this.renderMemoList();
    }
    
    clearCounterFilter() {
        this.currentCounterFilter = null;
        document.getElementById('counterFilterDisplay').style.display = 'none';
        this.renderCounterList();
    }
    
    clearScheduleFilter() {
        this.currentScheduleFilter = null;
        document.getElementById('scheduleFilterDisplay').style.display = 'none';
        if (this.currentMode === 'schedule') {
            this.renderMonthlyCalendar();
        }
    }// 전체 삭제 기능
    confirmClearAll(type) {
        let confirmMessage = '';
        switch(type) {
            case 'attendance':
                confirmMessage = 'Are you sure you want to delete all attendance records?';
                break;
            case 'schedules':
                confirmMessage = 'Are you sure you want to delete all schedules?';
                break;
            case 'todo':
                confirmMessage = 'Are you sure you want to delete all tasks?';
                break;
            case 'completed':
                confirmMessage = 'Are you sure you want to delete all completed items?';
                break;
            case 'memo':
                confirmMessage = 'Are you sure you want to delete all memos?';
                break;
            case 'counter':
                confirmMessage = 'Are you sure you want to delete all day counters?';
                break;
        }
        
        this.showConfirmModal(
            'Clear All Items',
            confirmMessage,
            () => {
                switch(type) {
                    case 'attendance':
                        this.clearAllAttendance();
                        break;
                    case 'schedules':
                        this.clearAllSchedules();
                        break;
                    case 'todo':
                        this.clearAllTodos();
                        break;
                    case 'completed':
                        this.clearAllCompleted();
                        break;
                    case 'memo':
                        this.clearAllMemos();
                        break;
                    case 'counter':
                        this.clearAllCounters();
                        break;
                }
            }
        );
    }
    
    clearAllAttendance() {
        this.attendanceData = {};
        this.attendanceLog = [];
        this.saveData();
        this.renderAttendanceLog();
        this.renderCalendar();
        this.showToast('All attendance records cleared!', 'success');
    }
    
    clearAllSchedules() {
        this.schedulesData = [];
        this.saveData();
        this.renderCalendar();
        if (this.currentMode === 'schedule') {
            this.renderMonthlyCalendar();
        }
        if (document.getElementById('allSchedulesModal').style.display === 'block') {
            this.renderAllSchedulesList();
        }
        this.updateModeStats();
        this.showToast('All schedules cleared!', 'success');
    }
    
    clearAllTodos() {
        this.todoData = [];
        this.currentTodoEditId = null;
        this.saveData();
        this.renderTodoList();
        this.renderCalendar();
        this.updateModeStats();
        this.showToast('All todos cleared!', 'success');
    }
    
    clearAllCompleted() {
        this.completedData = [];
        this.saveData();
        this.renderTodoList();
        this.renderCalendar();
        this.updateModeStats();
        this.showToast('All completed items cleared!', 'success');
    }
    
    clearAllMemos() {
        this.memoData = [];
        this.saveData();
        this.renderMemoList();
        this.renderCalendar();
        this.updateModeStats();
        this.showToast('All memos cleared!', 'success');
    }
    
    clearAllCounters() {
        this.counterData = [];
        this.saveData();
        this.renderCounterList();
        this.renderCalendar();
        this.updateModeStats();
        this.showToast('All counters cleared!', 'success');
    }
}

// 전역 인스턴스 생성 및 초기화
let attendanceChecker;

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM Content Loaded');
    
    setTimeout(() => {
        console.log('Starting initialization');
        
        try {
            attendanceChecker = new AttendanceChecker();
            window.attendanceChecker = attendanceChecker;
            console.log('AttendanceChecker initialized successfully');
        } catch (error) {
            console.error('Initialization error:', error);
        }
    }, 100);
});