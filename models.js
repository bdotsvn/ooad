// ============================================================
// HELPERS
// ============================================================
function newGuid() {
    return crypto.randomUUID();
}

// ============================================================
// DTOs - Data Transfer Objects (dùng để truyền dữ liệu giữa UI và Controller)
// Mapping: AppointmentDto, GroupMeetingDto
// ============================================================

class AppointmentDto {
    constructor({ name, location, startTime, endTime, reminders = [] }) {
        this.Name = name;
        this.Location = location;
        this.StartTime = new Date(startTime);
        this.EndTime = new Date(endTime);
        this.Reminders = reminders;
    }
}

class GroupMeetingDto {
    constructor({ id, meetingName, duration }) {
        this.Id = id;
        this.MeetingName = meetingName;
        this.Duration = duration; // milliseconds
    }
}

// ============================================================
// ENTITIES - Domain Objects (ánh xạ đến "database")
// Mapping: Appointment, Reminder, GroupMeeting, Participant, User
// ============================================================

class Reminder {
    constructor({ appointmentId, minutesBefore, type }) {
        this.Id = newGuid();
        this.AppointmentId = appointmentId;
        this.MinutesBefore = minutesBefore;
        this.Type = type; // 'none' | '5min' | '15min' | '1h'
    }
}

class Appointment {
    constructor({ userId, name, location, startTime, endTime }) {
        this.Id = newGuid();
        this.UserId = userId;
        this.Name = name;
        this.Location = location;
        this.StartTime = new Date(startTime);
        this.EndTime = new Date(endTime);
        this.Reminders = []; // List<Reminder>
    }

    GetDuration() {
        return this.EndTime - this.StartTime; // milliseconds
    }

    AddReminder(reminder) {
        if (reminder instanceof Reminder) {
            this.Reminders.push(reminder);
        }
    }
}

class Participant {
    constructor({ groupMeetingId, userId }) {
        this.Id = newGuid();
        this.GroupMeetingId = groupMeetingId;
        this.UserId = userId;
        this.JoinedDate = new Date();
    }
}

class GroupMeeting {
    constructor({ meetingName, startTime, endTime }) {
        this.Id = newGuid();
        this.MeetingName = meetingName;
        this.StartTime = new Date(startTime);
        this.EndTime = new Date(endTime);
        this.Participants = []; // List<Participant>
    }

    GetDuration() {
        return this.EndTime - this.StartTime; // milliseconds
    }

    AddParticipant(participant) {
        if (participant instanceof Participant) {
            this.Participants.push(participant);
        }
    }
}

class User {
    constructor({ username }) {
        this.Id = newGuid();
        this.Username = username;
        this.Appointments = []; // List<Appointment>
        this.Participations = []; // List<Participant>
    }

    AddAppointment(appt) {
        if (appt instanceof Appointment) {
            this.Appointments.push(appt);
        }
    }
}

// Export ra global scope để app.js sử dụng
window.Models = {
    AppointmentDto,
    GroupMeetingDto,
    Reminder,
    Appointment,
    Participant,
    GroupMeeting,
    User,
    newGuid,
};
