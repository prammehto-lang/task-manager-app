import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ======= 1. FIREBASE SETUP ======= //
const firebaseConfig = {
  apiKey: "AIzaSyCoM5zHdeXKQX-WyvfPh4YFj13b-p4Sv8s",
  authDomain: "task-manager-app-d18ed.firebaseapp.com",
  projectId: "task-manager-app-d18ed",
  storageBucket: "task-manager-app-d18ed.firebasestorage.app",
  messagingSenderId: "755783278034",
  appId: "1:755783278034:web:f39c0eab2bcd7ad84afc0b",
  measurementId: "G-J2PB57PVVV"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Global State
let memoryTasks = [];
let memoryTeam = [];
let calendarRendered = false;
let analyticsRendered = false;
let myCalendar = null;
let statusChart = null;
let employeeChart = null;

// DOM Elements
const taskForm = document.getElementById('taskForm');
const teamForm = document.getElementById('teamForm');
const taskGrid = document.getElementById('taskGrid');
const notificationBtn = document.getElementById('notificationBtn');

// ======= 2. SPA NAVIGATION ======= //
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
        // Active Tab UI
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        e.currentTarget.classList.add('active');

        // Hide all views, show desired
        const targetViewId = e.currentTarget.getAttribute('data-view');
        document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active-view'));
        document.getElementById(targetViewId).classList.add('active-view');

        // Trigger lazy-load rendering
        if (targetViewId === 'calendarView') renderCalendar();
        if (targetViewId === 'analyticsView') renderAnalytics();
    });
});

// Notifications
notificationBtn.addEventListener('click', () => {
    if ("Notification" in window) {
        Notification.requestPermission().then(p => {
            if (p === "granted") sendAlert("Alerts Enabled", "Task background tracking active.");
        });
    }
});

function sendAlert(title, body) {
    if (Notification.permission === 'granted') new Notification(title, { body, icon: 'icon-192x192.png' });
    createToast(title);
}

function createToast(message) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<i class="fa-solid fa-bell"></i> ${message}`;
    container.appendChild(t);
    setTimeout(() => t.remove(), 5000);
}

// ======= 3. TEAM MANAGEMENT ======= //

teamForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('teamName').value.trim();
    const mobile = document.getElementById('teamMobile').value.trim();
    const email = document.getElementById('teamEmail').value.trim();
    const role = document.getElementById('teamRole').value;

    try {
        await addDoc(collection(db, "team"), { name, mobile, email, role, addedAt: new Date().toISOString() });
        teamForm.reset();
        createToast("Team Member Added");
    } catch (error) {
        console.error("Error adding team member: ", error);
        alert("Make sure your Firestore Database is built and in 'Test Mode'");
    }
});

// Listen to Team changes
onSnapshot(collection(db, "team"), (snapshot) => {
    memoryTeam = [];
    snapshot.forEach((doc) => memoryTeam.push({ id: doc.id, ...doc.data() }));

    const teamList = document.getElementById('teamList');
    teamList.innerHTML = '';
    
    // Auto-fill Dropdowns (Task Form)
    const assignTo = document.getElementById('taskAssignedTo');
    const assignBy = document.getElementById('taskAssignedBy');
    assignTo.innerHTML = '<option value="" disabled selected>Select Employee</option>';
    assignBy.innerHTML = '<option value="" disabled selected>Select Admin</option>';

    memoryTeam.forEach(member => {
        // UI Render List
        teamList.innerHTML += `
            <div class="team-card">
                <div class="team-card-info">
                    <span class="team-name">${member.name}</span>
                    <div class="team-meta">
                        <span><i class="fa-solid fa-phone"></i> ${member.mobile}</span>
                        <span><i class="fa-solid fa-envelope"></i> ${member.email}</span>
                    </div>
                </div>
                <span class="team-role">${member.role}</span>
                <button class="btn-danger" style="padding: 0.3rem 0.6rem; border-radius: 4px;" onclick="window.deleteTeam('${member.id}')">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `;

        // Populate Dropdowns
        if (member.role === 'Employee') {
            assignTo.innerHTML += `<option value="${member.id}">${member.name}</option>`;
        } else {
            assignBy.innerHTML += `<option value="${member.id}">${member.name}</option>`;
        }
    });
});

window.deleteTeam = async (id) => {
    if(confirm("Remove team member?")) await deleteDoc(doc(db, "team", id));
};

// Smart Dropdown Event (Auto-fills inputs secretly for legacy Whatsapp logic)
document.getElementById('taskAssignedTo').addEventListener('change', (e) => {
    const member = memoryTeam.find(m => m.id === e.target.value);
    if(member) {
        document.getElementById('taskEmployeeMobile').value = member.mobile;
        document.getElementById('taskEmployeeEmail').value = member.email;
    }
});


// ======= CLIENT SIDE IMAGE COMPRESSION ======= //
function compressImage(file, maxWidth = 800) {
    return new Promise((resolve) => {
        if (!file) return resolve(null);
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                // Only scale down if width > maxWidth
                let scaleSize = 1;
                if (img.width > maxWidth) {
                    scaleSize = maxWidth / img.width;
                }
                
                canvas.width = img.width * scaleSize;
                canvas.height = img.height * scaleSize;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                
                // Extremely efficient compression to bypass 1MB database row limitations safely
                resolve(canvas.toDataURL('image/jpeg', 0.6));
            }
        };
    });
}

// ======= 4. CLOUD TASK MANAGEMENT ======= //

taskForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('taskName').value.trim();
    
    // Grab the text names from the selects, not raw IDs
    const assignToEl = document.getElementById('taskAssignedTo');
    const assignedToName = assignToEl.options[assignToEl.selectedIndex].text;
    
    const assignByEl = document.getElementById('taskAssignedBy');
    const assignedByName = assignByEl.options[assignByEl.selectedIndex].text;

    const employeeMobile = document.getElementById('taskEmployeeMobile').value;
    const employeeEmail = document.getElementById('taskEmployeeEmail').value;
    
    const startDate = document.getElementById('taskStartDate').value;
    const dueDate = document.getElementById('taskDueDate').value;
    const priority = document.getElementById('taskPriority').value;
    const status = document.getElementById('taskStatus').value;
    const reminderFreq = parseInt(document.getElementById('taskReminder').value);
    const remarks = document.getElementById('taskRemarks').value.trim();
    const imageFile = document.getElementById('taskImage').files[0];

    try {
        const imageBase64 = await compressImage(imageFile);

        const newTask = {
            title, assignedTo: assignedToName, assignedBy: assignedByName,
            employeeMobile, employeeEmail, startDate, dueDate,
            priority, status, reminderFreq, remarks, imageBase64,
            createdAt: new Date().toISOString(),
            lastReminderSent: new Date().getTime(),
            completionTime: null
        };
        
        await addDoc(collection(db, "tasks"), newTask);
        
        taskForm.reset();
        document.getElementById('taskPriority').value = "Medium";
        document.getElementById('taskStatus').value = "Pending";
        sendAlert(`Assigned to ${assignedToName}`, `Ensure they receive task details.`);
        
        if (confirm(`Fire WhatsApp request to ${assignedToName} now?`)) window.shareToWhatsApp(newTask);

    } catch (e) { console.error("Create task failed", e); }
});

// Global Snapshot
onSnapshot(collection(db, "tasks"), (snapshot) => {
    memoryTasks = [];
    snapshot.forEach(doc => memoryTasks.push({ displayId: doc.id.substring(0,6).toUpperCase(), dbId: doc.id, ...doc.data() }));
    
    // Re-render UI chunks
    renderTaskDashboard();
    if(calendarRendered) renderCalendar();
    if(analyticsRendered) renderAnalytics();
});

function renderTaskDashboard() {
    taskGrid.innerHTML = '';
    const now = new Date().getTime();

    // Sort by latest string
    let sortedTasks = [...memoryTasks].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));

    sortedTasks.forEach(task => {
        const card = document.createElement('div');
        card.className = `task-card priority-${task.priority}`;
        const isOverdue = (now > new Date(task.dueDate).getTime()) && task.status !== 'Completed';
        
        const fStart = new Date(task.startDate).toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'});
        const fDue = new Date(task.dueDate).toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'});

        card.innerHTML = `
            <div class="task-card-header">
                <div>
                    <span class="task-id">TSK-${task.displayId}</span>
                    <div class="task-card-title">${escapeHTML(task.title)}</div>
                </div>
                <button class="btn-icon-task" onclick="window.deleteTask('${task.dbId}')"><i class="fa-solid fa-trash"></i></button>
            </div>
            
            <div class="card-meta">
                <div><span class="meta-label">Team Exec</span><span class="meta-value">${escapeHTML(task.assignedTo)}</span></div>
                <div><span class="meta-label">Manager</span><span class="meta-value">${escapeHTML(task.assignedBy)}</span></div>
                <div><span class="meta-label">Start Time</span><span class="meta-value">${fStart}</span></div>
                <div><span class="meta-label">Deadline</span><span class="meta-value ${isOverdue ? 'overdue' : ''}">${fDue} ${isOverdue ? '🚨' : ''}</span></div>
            </div>

            <div class="task-card-desc">${escapeHTML(task.remarks) || '<i>No remarks provided</i>'}</div>
            
            ${task.imageBase64 ? `<img src="${task.imageBase64}" class="task-image-preview" alt="Task Attachment">` : ''}

            <div style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem;">
                <button class="btn btn-outline" style="padding: 0.3rem 0.6rem; font-size: 0.75rem;" onclick='shareToWhatsApp(${JSON.stringify(task).replace(/'/g, "&apos;")})'>
                    <i class="fa-brands fa-whatsapp" style="color: #25D366;"></i> Nudge
                </button>
            </div>

            ${task.completionTime ? `<div class="completion-time-bar">Closed at: ${new Date(task.completionTime).toLocaleString()}</div>` : ''}

            <div class="task-actions">
                <select class="status-select status-${task.status.replace(' ', '.')}" onchange="window.updateStatus('${task.dbId}', this.value)">
                    <option value="Pending" ${task.status === 'Pending' ? 'selected' : ''}>Pending</option>
                    <option value="In Progress" ${task.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
                    <option value="Completed" ${task.status === 'Completed' ? 'selected' : ''}>Completed</option>
                </select>
                <div style="font-size:0.75rem; color:var(--primary);"><i class="fa-solid fa-clock"></i> Tracking</div>
            </div>
        `;
        taskGrid.appendChild(card);
    });
}

window.updateStatus = async (dbId, newStatus) => {
    const task = memoryTasks.find(t => t.dbId === dbId);
    if (!task) return;
    
    let updates = { status: newStatus };
    if (newStatus === 'Completed' && task.status !== 'Completed') {
        updates.completionTime = new Date().toISOString();
        sendAlert(`Task Closed`, `${task.title} finished by ${task.assignedTo}`);
    } else if (newStatus !== 'Completed') {
        updates.completionTime = null;
    }
    
    await updateDoc(doc(db, "tasks", dbId), updates);
};

window.deleteTask = async (dbId) => {
    if(confirm("Destroy this record permanently?")) await deleteDoc(doc(db, "tasks", dbId));
};

// AUTO REMINDER LOOP
setInterval(async () => {
    const now = new Date().getTime();
    memoryTasks.forEach(async (task) => {
        if (task.status === "Completed") return; // Halt Logic
        
        let shouldUpdate = false;
        let updates = {};

        // Overdue Check
        if (now > new Date(task.dueDate).getTime() && !task.overdueFlagged) {
            sendAlert("Deadline Breached! 🚨", `${task.assignedTo}'s task: ${task.title}`);
            updates.overdueFlagged = true;
            shouldUpdate = true;
        }

        // Recurring Time Dilation Check
        if (now - task.lastReminderSent >= task.reminderFreq) {
            sendAlert("Auto-Reminder", `${task.title} is waiting on ${task.assignedTo}`);
            updates.lastReminderSent = now;
            shouldUpdate = true;
        }

        if(shouldUpdate) { await updateDoc(doc(db, "tasks", task.dbId), updates); }
    });
}, 10000); 

// Sharing Hooks
window.shareToWhatsApp = function(task) {
    if (!task.employeeMobile) return alert("Contact admin to add mobile number for this employee.");
    const msg = encodeURIComponent(`*NEW ASSIGNMENT: ${task.title}*\nBy: ${task.assignedBy}\nDue: ${new Date(task.dueDate).toLocaleString()}`);
    window.open(`https://wa.me/${task.employeeMobile.replace(/\D/g, '')}?text=${msg}`, '_blank');
};

// ======= 5. CALENDAR GENERATION ======= //
function renderCalendar() {
    if (!myCalendar) {
        const calEl = document.getElementById('calendar');
        myCalendar = new FullCalendar.Calendar(calEl, {
            initialView: 'dayGridMonth',
            headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek' },
            events: []
        });
        myCalendar.render();
        calendarRendered = true;
    }
    
    myCalendar.removeAllEvents();
    memoryTasks.forEach(task => {
        myCalendar.addEvent({
            title: `${task.title} (${task.assignedTo})`,
            start: task.startDate,
            end: task.dueDate,
            backgroundColor: task.status === 'Completed' ? '#10b981' : (task.status === 'In Progress' ? '#f59e0b' : '#3b82f6')
        });
    });
}

// ======= 6. ANALYTICS GENERATION ======= //
function renderAnalytics() {
    analyticsRendered = true;
    const stCount = { Pending: 0, 'In Progress': 0, Completed: 0 };
    const empCount = {};

    memoryTasks.forEach(t => {
        stCount[t.status]++;
        empCount[t.assignedTo] = (empCount[t.assignedTo] || 0) + 1;
    });

    if(statusChart) statusChart.destroy();
    if(employeeChart) employeeChart.destroy();

    statusChart = new Chart(document.getElementById('statusChart'), {
        type: 'doughnut',
        data: {
            labels: Object.keys(stCount),
            datasets: [{ data: Object.values(stCount), backgroundColor: ['#94a3b8', '#f59e0b', '#10b981'] }]
        },
        options: { plugins: { legend: { labels: { color: '#fff' } } } }
    });

    employeeChart = new Chart(document.getElementById('employeeChart'), {
        type: 'bar',
        data: {
            labels: Object.keys(empCount),
            datasets: [{ label: 'Total Assigned Tasks', data: Object.values(empCount), backgroundColor: '#3b82f6' }]
        },
        options: { scales: { y: { ticks: {color:'#fff'} }, x:{ ticks: {color:'#fff'} } }, plugins: { legend: { labels: { color: '#fff' } } } }
    });
}

function escapeHTML(str) { return str ? str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag])) : ''; }
