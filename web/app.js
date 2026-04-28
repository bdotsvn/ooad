document.addEventListener('DOMContentLoaded', () => {

    // ============================================================
    // SIMULATED DATABASE (CalendarDbContext)
    // ============================================================
    const db = {
        appointments: [],   // List<Appointment>
        groupMeetings: [],  // List<GroupMeeting>
        participants: [],   // List<Participant>
        reminders: [],      // List<Reminder>
    };

    // ============================================================
    // CURRENT USER (mô phỏng user đang đăng nhập)
    // ============================================================
    const currentUser = new Models.User({ username: 'Hoàng' });

    // ============================================================
    // LAYER 1: CreateAppointmentValidator
    // Mapping: val: CreateAppointmentValidator trong Sequence Diagram
    // Phương thức: Validate(request) -> { isValid, errors }
    // ============================================================
    const CreateAppointmentValidator = {
        Validate(dto) {
            const errors = [];
            if (!dto.Name || dto.Name.trim() === '') {
                errors.push('Tên cuộc hẹn không được để trống.');
            }
            if (!(dto.StartTime instanceof Date) || isNaN(dto.StartTime)) {
                errors.push('Thời gian bắt đầu không hợp lệ.');
            }
            if (!(dto.EndTime instanceof Date) || isNaN(dto.EndTime)) {
                errors.push('Thời gian kết thúc không hợp lệ.');
            }
            if (dto.StartTime && dto.EndTime && dto.EndTime <= dto.StartTime) {
                errors.push('Thời gian kết thúc phải sau thời gian bắt đầu.');
            }
            return { isValid: errors.length === 0, errors };
        }
    };

    // ============================================================
    // LAYER 2: AppointmentsController (Simulated API)
    // Mapping: api: AppointmentsController trong Sequence Diagram
    // Các endpoint được mô phỏng bằng async functions
    // ============================================================
    const AppointmentsController = {

        // POST /check-conflict
        async checkConflict(startTime, endTime) {
            const conflicts = db.appointments.filter(app =>
                app.UserId === currentUser.Id &&
                startTime < app.EndTime &&
                endTime > app.StartTime
            );
            return {
                HasConflict: conflicts.length > 0,
                ConflictingAppointments: conflicts,
                SuggestedTimes: conflicts.length > 0 ? _generateSuggestedTime(endTime) : null
            };
        },

        // POST /check-group-meeting
        async checkGroupMeeting(name, duration) {
            const match = db.groupMeetings.find(gm =>
                gm.MeetingName.toLowerCase() === name.toLowerCase() &&
                Math.abs(gm.GetDuration() - duration) < 60000 // tolerance 1 phút
            );
            return {
                IsMatch: !!match,
                GroupId: match ? match.Id : null,
                MeetingName: match ? match.MeetingName : null
            };
        },

        // DELETE /appointments/{id}
        async deleteAppointment(id) {
            const idx = db.appointments.findIndex(a => a.Id === id);
            if (idx !== -1) {
                db.appointments.splice(idx, 1);
                return true;
            }
            return false;
        },

        // POST /groupmeetings/{id}/join
        async joinGroupMeeting(groupId) {
            const gm = db.groupMeetings.find(g => g.Id === groupId);
            if (!gm) return { Success: false };
            const participant = new Models.Participant({
                groupMeetingId: groupId,
                userId: currentUser.Id
            });
            gm.AddParticipant(participant);
            db.participants.push(participant);
            currentUser.Participations.push(participant);
            return { Success: true };
        },

        // POST /appointments
        async createAppointment(dto, reminderSettings) {
            const appt = new Models.Appointment({
                userId: currentUser.Id,
                name: dto.Name,
                location: dto.Location,
                startTime: dto.StartTime,
                endTime: dto.EndTime,
            });
            // loop [Từng Reminder được set]
            for (const setting of reminderSettings) {
                if (setting.type !== 'none') {
                    const rem = new Models.Reminder({
                        appointmentId: appt.Id,
                        minutesBefore: setting.minutesBefore,
                        type: setting.type
                    });
                    appt.AddReminder(rem);
                    db.reminders.push(rem);
                }
            }
            db.appointments.push(appt);
            currentUser.AddAppointment(appt);
            return { Success: true, Appointment: appt };
        }
    };

    // ============================================================
    // LAYER 3: AppointmentService (Client-side service)
    // Mapping: clientSvc: AppointmentService trong Sequence Diagram
    // Điều phối các cuộc gọi Controller và trả kết quả về UI
    // ============================================================
    const AppointmentService = {

        async CheckConflictAsync(startTime, endTime) { // step 6 -> 7 -> ... -> 11
            return await AppointmentsController.checkConflict(startTime, endTime);
        },

        async DeleteAsync(conflictId) { // step 18 -> 19 -> ... -> 23
            return await AppointmentsController.deleteAppointment(conflictId);
        },

        async ValidateGroupMeetingAsync(name, duration) { // step 24 -> 25 -> ... -> 29
            return await AppointmentsController.checkGroupMeeting(name, duration);
        },

        async JoinGroupMeetingAsync(groupId) { // step 34 -> 35 -> ... -> 41
            return await AppointmentsController.joinGroupMeeting(groupId);
        },

        async CreateAsync(dto, reminderSettings) { // step 43 -> 44 -> ... -> 45
            return await AppointmentsController.createAppointment(dto, reminderSettings);
        }
    };

    // ============================================================
    // HELPERS
    // ============================================================
    function _generateSuggestedTime(afterTime) {
        const suggested = new Date(afterTime);
        suggested.setMinutes(suggested.getMinutes() + 15);
        return suggested;
    }

    function _parseReminderSettings(reminderValue) {
        const map = { 'none': 0, '5min': 5, '15min': 15, '1h': 60 };
        return [{ type: reminderValue, minutesBefore: map[reminderValue] || 0 }];
    }

    function _toLocalDatetimeString(date) {
        const d = new Date(date);
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        return d.toISOString().slice(0, 16);
    }

    // ============================================================
    // SELECTORS (UI - không thay đổi cấu trúc HTML)
    // ============================================================
    const calendarGrid = document.getElementById('calendar-grid');
    const monthYearText = document.getElementById('month-year');
    const appointmentsList = document.getElementById('appointments-list');
    const modal = document.getElementById('appointment-modal');
    const conflictModal = document.getElementById('conflict-modal');
    const groupModal = document.getElementById('group-modal');
    const appointmentForm = document.getElementById('appointment-form');

    let currentActiveDate = new Date();
    let selectedDate = new Date();

    // Pending state khi đang chờ user quyết định
    let pendingDto = null;
    let pendingConflicts = [];
    let pendingGroupId = null;

    // ============================================================
    // SAMPLE DATA (CalendarDbContext seed)
    // ============================================================
    function initSampleData() {
        const today = new Date();

        // GroupMeeting mẫu: "Team Standup" 9:00-9:30
        const gm = new Models.GroupMeeting({
            meetingName: 'Team Standup',
            startTime: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 9, 0),
            endTime: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 9, 30),
        });
        const p1 = new Models.Participant({ groupMeetingId: gm.Id, userId: 'user-bao' });
        const p2 = new Models.Participant({ groupMeetingId: gm.Id, userId: 'user-tri' });
        gm.AddParticipant(p1);
        gm.AddParticipant(p2);
        db.groupMeetings.push(gm);

        // Appointment mẫu: "Lunch Break" 12:00-13:00
        const lunch = new Models.Appointment({
            userId: currentUser.Id,
            name: 'Lunch Break',
            location: 'Canteen',
            startTime: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0),
            endTime: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 13, 0),
        });
        db.appointments.push(lunch);
        currentUser.AddAppointment(lunch);

        renderCalendar();
        renderAppointments();
    }

    // ============================================================
    // UI: CalendarPage - Render lịch
    // ============================================================
    function renderCalendar() {
        const firstDay = new Date(currentActiveDate.getFullYear(), currentActiveDate.getMonth(), 1);
        const lastDay = new Date(currentActiveDate.getFullYear(), currentActiveDate.getMonth() + 1, 0);

        monthYearText.innerText = currentActiveDate.toLocaleString('vi-VN', { month: 'long', year: 'numeric' });

        const labels = document.querySelectorAll('.day-label');
        calendarGrid.innerHTML = '';
        labels.forEach(l => calendarGrid.appendChild(l));

        for (let i = 0; i < firstDay.getDay(); i++) {
            const empty = document.createElement('div');
            empty.className = 'day-cell other-month';
            calendarGrid.appendChild(empty);
        }

        for (let d = 1; d <= lastDay.getDate(); d++) {
            const cell = document.createElement('div');
            cell.className = 'day-cell';
            cell.innerText = d;
            const dateObj = new Date(currentActiveDate.getFullYear(), currentActiveDate.getMonth(), d);
            if (dateObj.toDateString() === selectedDate.toDateString()) cell.classList.add('active');

            const hasEvent = db.appointments.some(a =>
                a.UserId === currentUser.Id &&
                a.StartTime.toDateString() === dateObj.toDateString()
            );
            if (hasEvent) cell.classList.add('has-event');

            cell.onclick = () => {
                selectedDate = dateObj;
                renderCalendar();
                renderAppointments();
            };
            calendarGrid.appendChild(cell);
        }
    }

    function renderAppointments() {
        const filtered = db.appointments.filter(a =>
            a.UserId === currentUser.Id &&
            a.StartTime.toDateString() === selectedDate.toDateString()
        );

        appointmentsList.innerHTML = '';
        if (filtered.length === 0) {
            appointmentsList.innerHTML = '<p class="empty-msg">Chưa có lịch hẹn nào cho ngày này.</p>';
            return;
        }

        filtered.sort((a, b) => a.StartTime - b.StartTime).forEach(app => {
            const card = document.createElement('div');
            card.className = 'appointment-card';
            const fmt = t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            card.innerHTML = `
                <h4>📅 ${app.Name}</h4>
                <div class="time">${fmt(app.StartTime)} - ${fmt(app.EndTime)}</div>
                <div class="location">📍 ${app.Location || 'N/A'}</div>
                ${app.Reminders.length > 0 ? `<div class="participants" style="font-size:0.75rem;color:#94a3b8;margin-top:5px;">🔔 Reminders: ${app.Reminders.length}</div>` : ''}
            `;
            appointmentsList.appendChild(card);
        });
    }

    function closeAllModals() {
        modal.style.display = 'none';
        conflictModal.style.display = 'none';
        groupModal.style.display = 'none';
        appointmentForm.reset();
        pendingDto = null;
        pendingConflicts = [];
        pendingGroupId = null;
    }

    function showSnackbar(msg) {
        let snackbar = document.getElementById('snackbar');
        if (!snackbar) {
            snackbar = document.createElement('div');
            snackbar.id = 'snackbar';
            snackbar.style.cssText = `
                position: fixed; bottom: 2rem; left: 50%; transform: translateX(-50%);
                background: #ef4444; color: white; padding: 0.75rem 1.5rem;
                border-radius: 12px; font-size: 0.9rem; z-index: 9999;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3); animation: fadeIn 0.3s ease;
            `;
            document.body.appendChild(snackbar);
        }
        snackbar.innerText = msg;
        snackbar.style.display = 'block';
        setTimeout(() => { snackbar.style.display = 'none'; }, 3000);
    }

    // ============================================================
    // UI: AddAppointmentWindow - Luồng Submit theo Sequence Diagram
    // ============================================================
    document.getElementById('add-btn').onclick = () => {
        // step 2: SyncDateTime() - tự động điền giờ dựa trên ngày đang chọn
        const now = new Date();
        const start = new Date(selectedDate);
        start.setHours(now.getHours() + 1, 0, 0, 0);
        const end = new Date(start);
        end.setHours(start.getHours() + 1);
        document.getElementById('start-time').value = _toLocalDatetimeString(start);
        document.getElementById('end-time').value = _toLocalDatetimeString(end);
        modal.style.display = 'flex';
    };

    appointmentForm.onsubmit = async (e) => {
        e.preventDefault();

        // Xây dựng DTO từ input
        const dto = new Models.AppointmentDto({
            name: document.getElementById('title').value,
            location: document.getElementById('location').value,
            startTime: document.getElementById('start-time').value,
            endTime: document.getElementById('end-time').value,
        });
        const reminderValue = document.getElementById('reminder').value;

        // step 3: Validate(request)
        const valResult = CreateAppointmentValidator.Validate(dto);

        // step 4/5: [Dữ liệu KHÔNG hợp lệ] -> Hiển thị lỗi Snackbar
        if (!valResult.isValid) {
            showSnackbar(valResult.errors.join(' '));
            return;
        }

        // step 6: [Dữ liệu hợp lệ] -> CheckConflictAsync
        const conflictRes = await AppointmentService.CheckConflictAsync(dto.StartTime, dto.EndTime);

        // step 11: [Phát hiện trùng lịch]
        if (conflictRes.HasConflict) {
            pendingDto = dto;
            pendingConflicts = conflictRes.ConflictingAppointments;
            const conflictNames = pendingConflicts.map(c => `"${c.Name}"`).join(', ');
            document.getElementById('conflict-msg').innerText =
                `Lịch "${dto.Name}" bị trùng với ${conflictNames} rồi ạ!`;
            // step 12: ShowAsync(ConflictingAppointments, SuggestedTimes)
            conflictModal.style.display = 'flex';
            modal.style.display = 'none';
            return;
        }

        // Không conflict -> tiếp tục luồng opt
        await _proceedToSaveOrGroupCheck(dto, reminderValue);
    };

    // ============================================================
    // UI: ConflictWarningDialog handlers
    // ============================================================

    // step 14 -> [Action == "Suggestion"]: Cập nhật thời gian theo gợi ý
    document.getElementById('choose-time-btn').onclick = async () => {
        const conflictRes = await AppointmentService.CheckConflictAsync(pendingDto.StartTime, pendingDto.EndTime);
        if (conflictRes.SuggestedTimes) {
            // step 16: Cập nhật thời gian theo gợi ý -> trở lại form
            const suggestedStart = conflictRes.SuggestedTimes;
            const duration = pendingDto.EndTime - pendingDto.StartTime;
            const suggestedEnd = new Date(suggestedStart.getTime() + duration);
            document.getElementById('start-time').value = _toLocalDatetimeString(suggestedStart);
            document.getElementById('end-time').value = _toLocalDatetimeString(suggestedEnd);
        }
        conflictModal.style.display = 'none';
        // step 17: Trở lại màn hình form (Đợi lưu lại)
        modal.style.display = 'flex';
    };

    // step 14 -> [Action == "Replace"]: loop xóa từng conflict rồi lưu
    document.getElementById('replace-btn').onclick = async () => {
        // step 18 -> 23: loop [Từng lịch bị trùng] - DeleteAsync
        for (const conflict of pendingConflicts) {
            await AppointmentService.DeleteAsync(conflict.Id);
        }
        conflictModal.style.display = 'none';
        const reminderValue = document.getElementById('reminder').value;
        // Sau khi replace xong -> tiếp tục opt lưu
        await _proceedToSaveOrGroupCheck(pendingDto, reminderValue);
    };

    // ============================================================
    // UI: GroupMeetingConfirmDialog handlers
    // ============================================================

    // step 32 -> [isConfirmed == true]: JoinGroupMeetingAsync
    document.getElementById('join-btn').onclick = async () => {
        // step 34: JoinGroupMeetingAsync(GroupId)
        const result = await AppointmentService.JoinGroupMeetingAsync(pendingGroupId);
        groupModal.style.display = 'none';
        if (result.Success) {
            // step 42: Thông báo "Đã thêm vào cuộc họp nhóm"
            showSnackbar('✅ Đã thêm anh vào Group Meeting thành công!');
        }
        pendingGroupId = null;
        renderAppointments();
    };

    // step 32 -> [isConfirmed == false]: tạo appointment bình thường
    document.getElementById('keep-own-btn').onclick = async () => {
        groupModal.style.display = 'none';
        const reminderValue = document.getElementById('reminder').value;
        await _doCreateAppointment(pendingDto, reminderValue);
    };

    // ============================================================
    // INTERNAL: Luồng opt - Kiểm tra Group Meeting rồi quyết định save
    // ============================================================
    async function _proceedToSaveOrGroupCheck(dto, reminderValue) {
        const duration = dto.EndTime - dto.StartTime;

        // step 24: ValidateGroupMeetingAsync(Name, Duration)
        const matchResult = await AppointmentService.ValidateGroupMeetingAsync(dto.Name, duration);

        // step 29: [matchResult.IsMatch == true]
        if (matchResult.IsMatch) {
            pendingDto = dto;
            pendingGroupId = matchResult.GroupId;
            document.getElementById('group-msg').innerText =
                `Có vẻ anh muốn tham gia Group Meeting "${matchResult.MeetingName}" đã có sẵn. Anh có muốn join không?`;
            // step 30: ShowAsync()
            groupModal.style.display = 'flex';
            return;
        }

        // [Không trùng Group Meeting] -> Tạo appointment mới
        await _doCreateAppointment(dto, reminderValue);
    }

    async function _doCreateAppointment(dto, reminderValue) {
        const reminderSettings = _parseReminderSettings(reminderValue);
        // step 43: CreateAsync(request)
        const result = await AppointmentService.CreateAsync(dto, reminderSettings);
        closeAllModals();
        if (result.Success) {
            // step 45: Thông báo "Tạo lịch hẹn mới thành công"
            showSnackbar('✅ Đã tạo lịch hẹn mới thành công!');
            renderCalendar();
            renderAppointments();
        }
    }

    // ============================================================
    // NAVIGATION & CLOSE EVENTS
    // ============================================================
    document.getElementById('prev-btn').onclick = () => {
        currentActiveDate.setMonth(currentActiveDate.getMonth() - 1);
        renderCalendar();
    };
    document.getElementById('next-btn').onclick = () => {
        currentActiveDate.setMonth(currentActiveDate.getMonth() + 1);
        renderCalendar();
    };

    document.querySelectorAll('.close-btn, .cancel-btn').forEach(btn => {
        btn.onclick = closeAllModals;
    });

    window.onclick = (e) => {
        if (e.target === modal || e.target === conflictModal || e.target === groupModal) {
            closeAllModals();
        }
    };

    // ============================================================
    // KHỞI TẠO APP
    // ============================================================
    initSampleData();
});
