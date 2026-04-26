import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

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
const storage = getStorage(app);

// Global State
let memoryTasks = [];
let memoryTeam = [];
let calendarRendered = false;
let analyticsRendered = false;
let myCalendar = null;
let statusChart = null;
let employeeChart = null;
let editingTeamId = null;
let editingTaskId = null;
let isAdmin = localStorage.getItem('taskflow_admin') === 'true';
let currentAgent = localStorage.getItem('taskflow_agent') || null;

window.toggleAdmin = function() {
    if (isAdmin) {
        localStorage.removeItem('taskflow_admin');
        isAdmin = false;
        createToast("Locked: Admin Mode Disabled");
        checkAdminUI();
        renderTaskDashboard();
    } else {
        const pass = prompt("Enter Admin Password:");
        if (pass === "admin2026") {
            currentAgent = null;
            localStorage.removeItem('taskflow_agent');
            localStorage.setItem('taskflow_admin', 'true');
            isAdmin = true;
            createToast("Unlocked: Admin Mode Active 🔓");
            checkAdminUI();
            renderTaskDashboard();
        } else if (pass !== null) {
            alert("Incorrect password!");
        }
    }
};

function initIdentityOverlay() {
    const overlay = document.getElementById('identityOverlay');
    const layout = document.getElementById('mainAppLayout');
    
    document.getElementById('loginAgentBtn').addEventListener('click', () => {
        const select = document.getElementById('agentSelect');
        const agentName = select.options[select.selectedIndex]?.text;
        if (!agentName || agentName === "Loading Team...") return alert("Please select your profile first.");
        
        currentAgent = agentName;
        localStorage.setItem('taskflow_agent', agentName);
        localStorage.removeItem('taskflow_admin');
        isAdmin = false;
        
        overlay.style.display = 'none';
        layout.style.display = 'flex';
        checkAdminUI();
        renderTaskDashboard();
    });

    document.getElementById('bypassAdminBtn').addEventListener('click', () => window.toggleAdmin());

    if (isAdmin || currentAgent) {
        overlay.style.display = 'none';
        layout.style.display = 'flex';
    }
}

function checkAdminUI() {
    const navTeam = document.getElementById('navTeamAdmin');
    const navLogin = document.getElementById('navAdminLogin');
    const taskFormSection = document.querySelector('.task-form-section');
    const navCalendar = document.querySelector('.nav-item[data-view="calendarView"]');
    const navAnalytics = document.querySelector('.nav-item[data-view="analyticsView"]');
    
    if (!navTeam || !navLogin) return;

    if (isAdmin) {
        navTeam.style.display = 'flex';
        navLogin.innerHTML = '<i class="fa-solid fa-unlock"></i> <span>Lock AdminMode</span>';
        if(taskFormSection) taskFormSection.style.display = 'block';
        if(navCalendar) navCalendar.style.display = 'flex';
        if(navAnalytics) navAnalytics.style.display = 'flex';
    } else {
        navTeam.style.display = 'none';
        navLogin.innerHTML = '<i class="fa-solid fa-lock"></i> <span>Unlock AdminMode</span>';
        
        if (currentAgent) {
           if(taskFormSection) taskFormSection.style.display = 'none';
           if(navCalendar) navCalendar.style.display = 'none';
           if(navAnalytics) navAnalytics.style.display = 'none';
        } else {
           if(taskFormSection) taskFormSection.style.display = 'block';
        }
        
        if (navTeam.classList.contains('active')) {
            document.querySelector('.nav-item[data-view="dashboardView"]').click();
        }
    }
    
    // Wire up Admin Filters if not previously done
    const searchF = document.getElementById('searchFilter');
    const statusF = document.getElementById('statusFilter');
    if (searchF && !searchF.dataset.wired) {
        searchF.addEventListener('input', renderTaskDashboard);
        statusF.addEventListener('change', renderTaskDashboard);
        searchF.dataset.wired = "true";
    }
}
document.addEventListener('DOMContentLoaded', () => { initIdentityOverlay(); checkAdminUI(); });

// DOM Elements
const taskForm = document.getElementById('taskForm');
const teamForm = document.getElementById('teamForm');
const taskGrid = document.getElementById('taskGrid');
const notificationBtn = document.getElementById('notificationBtn');

// ======= 2.5 MOBILE CAMERA CRASH RECOVERY ======= //
// Android Chrome often kills the browser tab when opening the HD Camera to free up RAM.
// This auto-saves form text so users don't lose their data after the "Low Memory" reload crash.
const taskFormFields = ['taskName', 'taskStartDate', 'taskDueDate', 'taskPriority', 'taskStatus', 'taskReminder', 'taskRecurrence', 'taskRemarks'];

function initCrashRecovery() {
    taskFormFields.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        
        // Restore drafted text on reload
        const savedVal = localStorage.getItem(`draft_${id}`);
        if (savedVal) el.value = savedVal;
        
        // Save text as user types
        el.addEventListener('input', () => localStorage.setItem(`draft_${id}`, el.value));
        el.addEventListener('change', () => localStorage.setItem(`draft_${id}`, el.value));
    });
}
document.addEventListener('DOMContentLoaded', initCrashRecovery);

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
        
        // Ensure Admin UI stays in sync when flipping tabs
        checkAdminUI();
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
        if (editingTeamId) {
            await updateDoc(doc(db, "team", editingTeamId), { name, mobile, email, role, addedAt: new Date().toISOString() });
            createToast("Team Member Updated");
            editingTeamId = null;
            document.getElementById('submitTeamBtn').innerText = "Save Member";
        } else {
            await addDoc(collection(db, "team"), { name, mobile, email, role, addedAt: new Date().toISOString() });
            createToast("Team Member Added");
        }
        teamForm.reset();
    } catch (error) {
        console.error("Error saving team member: ", error);
        alert("Error saving! Make sure Database rules allow writes.");
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
                <div style="display: flex; gap: 0.5rem;">
                    <button class="btn-outline" style="padding: 0.3rem 0.6rem; border-radius: 4px; color: var(--text-primary);" onclick="window.editTeam('${member.id}')">
                        <i class="fa-solid fa-pencil"></i>
                    </button>
                    <button class="btn-danger" style="padding: 0.3rem 0.6rem; border-radius: 4px;" onclick="window.deleteTeam('${member.id}')">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>
        `;

        // Populate Dropdowns
        if (member.role === 'Employee') {
            assignTo.innerHTML += `<option value="${member.id}">${member.name}</option>`;
            const agentSelect = document.getElementById('agentSelect');
            if(agentSelect && !agentSelect.innerHTML.includes(`>${member.name}<`)) {
                if (agentSelect.innerHTML.includes("Loading Team...")) {
                    agentSelect.innerHTML = '<option value="" disabled selected>Select Your Profile</option>';
                }
                agentSelect.innerHTML += `<option value="${member.id}">${member.name}</option>`;
            }
        } else {
            assignBy.innerHTML += `<option value="${member.id}">${member.name}</option>`;
        }
    });
});

window.editTeam = (id) => {
    const member = memoryTeam.find(m => m.id === id);
    if (!member) return;
    document.getElementById('teamName').value = member.name;
    document.getElementById('teamMobile').value = member.mobile;
    document.getElementById('teamEmail').value = member.email;
    document.getElementById('teamRole').value = member.role;
    
    editingTeamId = id;
    document.getElementById('submitTeamBtn').innerText = "Update Member";
    window.scrollTo({top: 0, behavior: 'smooth'});
};

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
                let scaleSize = 1;
                if (img.width > maxWidth) {
                    scaleSize = maxWidth / img.width;
                }
                
                canvas.width = img.width * scaleSize;
                canvas.height = img.height * scaleSize;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
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
    const recurrence = document.getElementById('taskRecurrence').value || 'None';
    const remarks = document.getElementById('taskRemarks').value.trim();
    const imageFile = document.getElementById('taskImage').files[0];

    try {
        let photoUrl = null;
        if (imageFile) {
            createToast("Uploading Photo Attachment... ⏳");
            const storageRef = ref(storage, 'task-attachments/' + Date.now() + '_' + imageFile.name);
            await uploadBytes(storageRef, imageFile);
            photoUrl = await getDownloadURL(storageRef);
        }

        const taskData = {
            title, assignedTo: assignedToName, assignedBy: assignedByName,
            employeeMobile, employeeEmail, startDate, dueDate,
            priority, status, reminderFreq, recurrence, remarks,
            lastReminderSent: new Date().getTime()
        };
        if (photoUrl) {
           taskData.photoUrl = photoUrl;
        } else if (imageFile) {
           // fallback just in case
           taskData.imageBase64 = await compressImage(imageFile);
        }

        if (editingTaskId) {
            await updateDoc(doc(db, "tasks", editingTaskId), taskData);
            createToast("Task Updated");
            editingTaskId = null;
            document.getElementById('submitTaskBtn').innerHTML = `<i class="fa-solid fa-paper-plane"></i> Assign & Start Auto-Reminders`;
        } else {
            taskData.createdAt = new Date().toISOString();
            taskData.completionTime = null;
            await addDoc(collection(db, "tasks"), taskData);
            sendAlert(`Assigned to ${assignedToName}`, `Ensure they receive task details.`);
            if (confirm(`Fire WhatsApp request to ${assignedToName} now?`)) window.shareToWhatsApp(taskData);
        }
        
        taskForm.reset();
        document.getElementById('taskPriority').value = "Medium";
        document.getElementById('taskStatus').value = "Pending";
        document.getElementById('taskRecurrence').value = "None";
        
        // Clear drafts on successful assignment
        taskFormFields.forEach(id => localStorage.removeItem(`draft_${id}`));

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

    const searchFilterEl = document.getElementById('searchFilter');
    const statusFilterEl = document.getElementById('statusFilter');
    const searchVal = searchFilterEl ? searchFilterEl.value.toLowerCase() : '';
    const statusVal = statusFilterEl ? statusFilterEl.value : 'All';

    // Sort by latest string
    let sortedTasks = [...memoryTasks].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // Sort logic to push Urgent tasks to the absolute top
    sortedTasks.sort((a, b) => {
        if (a.priority === 'Urgent' && b.priority !== 'Urgent') return -1;
        if (b.priority === 'Urgent' && a.priority !== 'Urgent') return 1;
        return 0;
    });

    sortedTasks.forEach(task => {
        // Enforce Agent Flow Privacy
        if (!isAdmin && currentAgent && task.assignedTo !== currentAgent) {
            return;
        }

        // Apply Admin Dashboard Filters
        if (isAdmin || !currentAgent) {
            if (statusVal !== 'All' && task.status !== statusVal) return;
            if (searchVal) {
                const compositeString = `${task.title} ${task.assignedTo} ${task.priority}`.toLowerCase();
                if (!compositeString.includes(searchVal)) return;
            }
        }

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
                ${isAdmin ? `
                <div style="display: flex; gap: 0.5rem;">
                    <button class="btn-icon-task" onclick="window.editTask('${task.dbId}')" title="Edit Task"><i class="fa-solid fa-pencil"></i></button>
                    <button class="btn-icon-task" onclick="window.deleteTask('${task.dbId}')" title="Delete Task"><i class="fa-solid fa-trash"></i></button>
                </div>
                ` : ''}
            </div>
            
            <div class="card-meta">
                <div><span class="meta-label">Team Exec</span><span class="meta-value">${escapeHTML(task.assignedTo)}</span></div>
                <div><span class="meta-label">Manager</span><span class="meta-value">${escapeHTML(task.assignedBy)}</span></div>
                <div><span class="meta-label">Start Time</span><span class="meta-value">${fStart}</span></div>
                <div><span class="meta-label">Deadline</span><span class="meta-value ${isOverdue ? 'overdue' : ''}">${fDue} ${isOverdue ? '🚨' : ''}</span></div>
            </div>

            <div class="task-card-desc">${escapeHTML(task.remarks) || '<i>No remarks provided</i>'}</div>
            
            ${task.photoUrl ? `<a href="${task.photoUrl}" target="_blank" style="display:block; margin: 10px 0;"><img src="${task.photoUrl}" class="task-image-preview" alt="Task Attachment"></a>` : 
             (task.imageBase64 ? `<img src="${task.imageBase64}" class="task-image-preview" alt="Task Attachment">` : '')}

            <div style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem;">
                <button class="btn btn-outline" style="padding: 0.3rem 0.6rem; font-size: 0.75rem;" onclick='shareToWhatsApp(${JSON.stringify(task).replace(/'/g, "&apos;")})'>
                    <i class="fa-brands fa-whatsapp" style="color: #25D366;"></i> Nudge
                </button>
                ${task.reminderFreq === 0 ? `<span style="font-size:0.75rem; color:var(--text-secondary); display:flex; align-items:center;"><i class="fa-solid fa-bell-slash"></i>&nbsp;Off</span>` : ''}
            </div>

            ${task.completionTime ? `<div class="completion-time-bar">Closed at: ${new Date(task.completionTime).toLocaleString()}</div>` : ''}

            <div class="task-actions">
                <select class="status-select status-${task.status.replace(' ', '.')}" onchange="window.updateStatus('${task.dbId}', this.value)" ${isAdmin ? '' : 'disabled'}>
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

window.editTask = (id) => {
    const task = memoryTasks.find(t => t.dbId === id);
    if (!task) return;
    
    document.getElementById('taskName').value = task.title;
    
    const assignToEl = document.getElementById('taskAssignedTo');
    Array.from(assignToEl.options).forEach((opt, idx) => { if(opt.text === task.assignedTo) assignToEl.selectedIndex = idx; });

    const assignByEl = document.getElementById('taskAssignedBy');
    Array.from(assignByEl.options).forEach((opt, idx) => { if(opt.text === task.assignedBy) assignByEl.selectedIndex = idx; });

    document.getElementById('taskEmployeeMobile').value = task.employeeMobile;
    document.getElementById('taskEmployeeEmail').value = task.employeeEmail;
    document.getElementById('taskStartDate').value = task.startDate;
    document.getElementById('taskDueDate').value = task.dueDate;
    document.getElementById('taskPriority').value = task.priority;
    document.getElementById('taskStatus').value = task.status;
    document.getElementById('taskReminder').value = task.reminderFreq;
    if (document.getElementById('taskRecurrence')) document.getElementById('taskRecurrence').value = task.recurrence || 'None';
    document.getElementById('taskRemarks').value = task.remarks;
    
    editingTaskId = id;
    document.getElementById('submitTaskBtn').innerHTML = `<i class="fa-solid fa-pencil"></i> Update Task Details`;
    
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelector('.nav-item[data-view="dashboardView"]').classList.add('active');
    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active-view'));
    document.getElementById('dashboardView').classList.add('active-view');
    window.scrollTo({top: 0, behavior: 'smooth'});
};

window.updateStatus = async (dbId, newStatus) => {
    const task = memoryTasks.find(t => t.dbId === dbId);
    if (!task) return;
    
    let updates = { status: newStatus };
    if (newStatus === 'Completed' && task.status !== 'Completed') {
        updates.completionTime = new Date().toISOString();
        sendAlert(`Task Closed`, `${task.title} finished by ${task.assignedTo}`);
        
        if (task.recurrence && task.recurrence !== 'None') {
            await cloneRecurringTask(task);
        }
    } else if (newStatus !== 'Completed') {
        updates.completionTime = null;
    }
    
    await updateDoc(doc(db, "tasks", dbId), updates);
};

async function cloneRecurringTask(task) {
    const sDate = new Date(task.startDate);
    const dDate = new Date(task.dueDate);
    
    // Offset dates based on pattern
    if (task.recurrence === 'Daily') {
        sDate.setDate(sDate.getDate() + 1);
        dDate.setDate(dDate.getDate() + 1);
    } else if (task.recurrence === 'Weekly') {
        sDate.setDate(sDate.getDate() + 7);
        dDate.setDate(dDate.getDate() + 7);
    } else if (task.recurrence === 'Monthly') {
        sDate.setMonth(sDate.getMonth() + 1);
        dDate.setMonth(dDate.getMonth() + 1);
    }
    
    const newTask = {
        title: task.title, assignedTo: task.assignedTo, assignedBy: task.assignedBy,
        employeeMobile: task.employeeMobile, employeeEmail: task.employeeEmail, 
        startDate: sDate.toISOString().slice(0, 16), dueDate: dDate.toISOString().slice(0, 16),
        priority: task.priority, status: 'Pending', reminderFreq: task.reminderFreq, 
        recurrence: task.recurrence, remarks: task.remarks,
        lastReminderSent: new Date().getTime(), createdAt: new Date().toISOString()
    };
    if (task.imageBase64) newTask.imageBase64 = task.imageBase64;
    
    await addDoc(collection(db, "tasks"), newTask);
    sendAlert("Recurring Task Generated", `Next occurrence created for ${task.title}`);
}

window.deleteTask = async (dbId) => {
    if(confirm("Destroy this record permanently?")) await deleteDoc(doc(db, "tasks", dbId));
};

// AUTO REMINDER LOOP
setInterval(async () => {
    const now = new Date().getTime();
    memoryTasks.forEach(async (task) => {
        if (task.status === "Completed") return; // Halt Logic
        if (task.reminderFreq === 0) return; // Ignore manually stopped tasks
        
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
    
    let reminderText = "Off";
    if (task.reminderFreq === 1800000) reminderText = "Every 30 mins";
    else if (task.reminderFreq === 3600000) reminderText = "Every 1 Hour";
    else if (task.reminderFreq === 86400000) reminderText = "Every Day";
    else if (task.reminderFreq > 0) reminderText = "Active";

    let message = `*NEW ASSIGNMENT: ${task.title}* 📋\n`;
    message += `*Assigned By:* ${task.assignedBy}\n`;
    message += `*Deadline:* ${new Date(task.dueDate).toLocaleString()} ⏰\n`;
    if (task.remarks) message += `*Remarks:* ${task.remarks}\n`;
    message += `*Reminders:* You will be reminded ${reminderText}.\n`;
    
    if (task.photoUrl) {
        message += `\n*Attachment (Click to View):*\n${task.photoUrl}\n`;
    }

    const msg = encodeURIComponent(message);
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
