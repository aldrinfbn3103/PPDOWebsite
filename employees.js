/* =======================================================================
   employees.js — Personnel & Administrative Services: the staff table
   (Administrative Services page) and the public Staff Directory that
   mirrors it.

   The table itself is read-only — the Edit button (which opens the
   Add/Edit modal below) is the only way to change an employee's
   information. There is no more inline contenteditable editing.

   Depends on api.js (escapeHtml, normalize, nowLabel, openModal/closeModal)
   and dashboard.js (admin gating is applied to the Administrative Services
   page by dashboard.js applyAdminUI/adminGate/adminBody elements).
   ======================================================================= */

/* ---------------- Employee status ---------------- */
var statusMeta = {
  'In Office': {cls:'status-in-office'},
  'Traveling': {cls:'status-traveling'},
  'On Leave': {cls:'status-on-leave'},
  'Field Work': {cls:'status-field-work'},
  'Work From Home': {cls:'status-wfh'}
};
function initials(name){
  return name.split(' ').filter(Boolean).slice(0,2).map(function(p){ return p[0].toUpperCase(); }).join('');
}

// Pulls a bare Google Drive file ID out of whatever got saved in the
// photo column — a raw ID, or any of Drive's URL shapes
// (.../file/d/ID/view, .../open?id=ID, .../uc?id=ID, .../thumbnail?id=ID).
// Needed because a "view" URL (the one Drive's share dialog normally
// hands you) is an HTML page, not raw image bytes — passing it straight
// to <img src="..."> fails even when the file's sharing is set correctly.
function extractDriveId_(raw){
  if(!raw) return '';
  var m = raw.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || raw.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if(m) return m[1];
  if(/^[a-zA-Z0-9_-]{10,}$/.test(raw)) return raw; // already a bare file ID
  return '';
}

// Builds a displayable image URL from whatever is stored in the photo
// column. New uploads store just the Google Drive file ID (see
// openEmployeeForm), which is turned into a Drive thumbnail URL here.
// Records saved before the photo-upload feature existed may still have
// a full URL stored directly (the old "Photo URL" text field) — those
// are passed through unchanged so old data keeps working, unless it's
// a Drive link, in which case the real file ID is extracted so it
// actually resolves to an image instead of an HTML viewer page.
function photoUrl(photo){
  if(!photo) return '';
  var driveId = extractDriveId_(photo);
  if(driveId) return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(driveId) + '&sz=w200';
  if(/^https?:\/\//i.test(photo)) return photo;
  return '';
}

// Avatar contents: the uploaded photo when one exists, otherwise the
// employee's initials (the original fallback behavior, unchanged).
// If the photo URL fails to load (e.g. a Drive file that isn't shared
// as "Anyone with the link"), onerror swaps it back to initials instead
// of leaving the browser's broken-image icon on screen.
function avatarInner(e){
  if(!e.photo) return initials(e.name);
  var fallback = initials(e.name).replace(/'/g, "\\'");
  return '<img src="'+photoUrl(e.photo)+'" alt="" style="width:100%; height:100%; border-radius:50%; object-fit:cover; display:block;" onerror="this.replaceWith(document.createTextNode(\''+fallback+'\'))">';
}

var employees = [];
var employeeSeq = 1;


function empRow(e){
  var meta = statusMeta[e.status] || statusMeta['In Office'];
  var actions = adminSignedIn
    ? '<button class="row-edit" data-emp-edit="'+e.id+'" title="Edit">✎</button><button class="row-remove" data-emp-remove="'+e.id+'" title="Remove">✕</button>'
    : '<span style="color:var(--ink-soft); font-size:11.5px;">View only</span>';
  return '<tr data-id="'+e.id+'">'
    + '<td><div class="emp-name-cell"><div class="emp-avatar" style="overflow:hidden;" data-emp-avatar="'+e.id+'">'+avatarInner(e)+'</div><span data-emp-name="'+e.id+'">'+escapeHtml(e.name)+'</span></div></td>'
    + '<td><span data-emp-division="'+e.id+'">'+escapeHtml(e.division)+'</span></td>'
    + '<td data-emp-position="'+e.id+'">'+escapeHtml(e.position || '—')+'</td>'
    + '<td><span class="status-badge '+meta.cls+'" data-emp-status="'+e.id+'">'+escapeHtml(e.status)+'</span></td>'
    + '<td style="font-size:12px; color:var(--ink-soft);" data-emp-updated="'+e.id+'">'+escapeHtml(e.updated)+'</td>'
    + '<td>'+actions+'</td>'
    + '</tr>';
}

async function loadEmployees() {
  try {

    const result = await getEmployees();

    if (!result.success) {
      console.error(result.message);
      return;
    }

   employees = result.data
    .filter(emp => emp.isActive === true || emp.isActive === "TRUE")
    .map(emp => {

        const fullName = [
            emp.FirstName,
            emp.MiddleName,
            emp.LastName
        ]
        .filter(Boolean)
        .join(" ");

        return {

            id: emp.employeeID,

            name: fullName,

            // Raw fields kept around so the Edit form can be pre-filled.
            firstName: emp.FirstName || "",

            middleName: emp.MiddleName || "",

            lastName: emp.LastName || "",

            email: emp.email || "",

            phone: emp.phone || "",

            position: emp.position || "",

            division: emp.division,

            employeeType: emp.employeeType || "Regular",

            status: emp.status || "In Office",

            photo: emp.photo || "",

            dateHired: emp.dateHired || "",

            updated: emp.updatedAt || ""

        };

    });

    renderEmployees();

  } catch (err) {

    console.error("Failed to load employees:", err);

  }
}

function renderEmployees(){
  document.getElementById('employeeTable').innerHTML = employees.length
    ? employees.map(empRow).join('')
    : '<tr><td colspan="6" style="text-align:center; color:var(--ink-soft);">No personnel on record yet.</td></tr>';
  wireEmployeeRows();
  renderStaffDirectory();
  updatePersonnelStat();
}

function updatePersonnelStat(){
  var statEl = document.getElementById('statPersonnel');
  if(!statEl) return;
  statEl.textContent = employees.length;
  var card = statEl.closest('.stat-card');
  if(card){
    card.classList.remove('stat-saved-flash');
    void card.offsetWidth;
    card.classList.add('stat-saved-flash');
  }
}

/* ---------------- Public staff directory (mirrors the employees list above) ---------------- */
function staffCard(e){
  var meta = statusMeta[e.status] || statusMeta['In Office'];
  return '<div class="card" style="display:flex; flex-direction:column; gap:12px; padding:16px;">'
    + '<div style="display:flex; align-items:center; gap:12px;">'
    + '<div class="emp-avatar" style="width:44px; height:44px; font-size:15px; overflow:hidden;">'+avatarInner(e)+'</div>'
    + '<div style="min-width:0;"><h4 style="margin:0; font-size:14px;">'+escapeHtml(e.name)+'</h4><p style="margin:2px 0 0; font-size:12px; color:var(--ink-soft);">'+escapeHtml(e.division)+'</p></div>'
    + '</div>'
    + '<div style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;">'
    + '<span class="status-badge '+meta.cls+'">'+escapeHtml(e.status)+'</span>'
    + '<span style="font-size:11.5px; color:var(--ink-soft); text-align:right;">'+escapeHtml(e.position)+'</span>'
    + '</div>'
    + '</div>';
}
function renderStaffDirectory(){
  var grid = document.getElementById('staffDirectoryGrid');
  if(!grid) return;
  var searchInput = document.getElementById('staffSearchInput');
  var q = normalize(searchInput ? searchInput.value : '');
  var list = employees.filter(function(e){
    if(!q) return true;
    return normalize(e.name).indexOf(q) !== -1 || normalize(e.division).indexOf(q) !== -1;
  });
  grid.innerHTML = list.length
    ? list.map(staffCard).join('')
    : '<p style="color:var(--ink-soft); font-size:13px;">No staff match your search.</p>';
}
(function(){
  var searchInput = document.getElementById('staffSearchInput');
  if(searchInput) searchInput.addEventListener('input', renderStaffDirectory);
})();

// The table is read-only: status, division, and name are shown as plain
// text/badges, not form controls. The Edit button (below) is the only way
// to change any of them.
function wireEmployeeRows(){
  document.querySelectorAll('[data-emp-edit]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var emp = employees.find(function(x){ return x.id === btn.dataset.empEdit; });
      if(!emp) return;
      openEmployeeForm(emp);
    });
  });
  document.querySelectorAll('[data-emp-remove]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var id = btn.dataset.empRemove;
      var emp = employees.find(function(x){ return x.id === id; });
      var rawName = emp ? emp.name : 'this employee';
      var name = escapeHtml(rawName);

      openModal(
        'Delete Employee',
        '<p>Are you sure you want to delete <strong>'+name+'</strong>?</p>'
          + '<p style="color:var(--ink-soft); font-size:12.5px;">This is a soft delete — the record stays in Google Sheets, it just stops appearing here.</p>'
          + '<p style="margin-top:14px;"><a href="#" id="lnkRemovePermanent" style="color:var(--ink-soft); font-size:12.5px; text-decoration:underline;">Remove this record permanently instead</a></p>',
        async function(){
          const result = await deleteEmployee(id);
          if(!result.success){
            alert(result.message);
            return false;
          }
          logActivity('Employees', 'Delete', id, 'Archived employee ' + rawName + ' (soft delete).');
          await loadEmployees();
        },
        { saveLabel: 'Delete', saveClass: 'btn btn-danger' }
      );

      var lnk = document.getElementById('lnkRemovePermanent');
      if(lnk){
        lnk.addEventListener('click', function(ev){
          ev.preventDefault();
          closeModal();
          openPermanentRemoveModal(id, name, rawName);
        });
      }
    });
  });
}

// Second, separate confirmation for the irreversible permanent delete
// (Issue 4). Kept as its own modal — reached via the link inside the
// soft-delete modal above — rather than a new row button, so the table
// layout stays exactly as it was.
function openPermanentRemoveModal(id, name, rawName){
  openModal(
    'Remove Employee Permanently',
    '<p>Are you sure you want to permanently remove <strong>'+name+'</strong>?</p>'
      + '<p style="color:var(--ink-soft); font-size:12.5px;">This action cannot be undone.</p>',
    async function(){
      const result = await removeEmployeePermanently(id);
      if(!result.success){
        alert(result.message);
        return false;
      }
      logActivity('Employees', 'Delete', id, 'Permanently removed employee ' + (rawName || name) + '.');
      await loadEmployees();
    },
    { saveLabel: 'Remove Permanently', saveClass: 'btn btn-danger' }
  );
}

// Reads a File into a base64 string (no "data:...;base64," prefix), ready
// to send to the backend as JSON for Drive upload.
function fileToBase64(file){
  return new Promise(function(resolve, reject){
    var reader = new FileReader();
    reader.onload = function(){ resolve(reader.result.split(',')[1]); };
    reader.onerror = function(){ reject(reader.error); };
    reader.readAsDataURL(file);
  });
}

// Compares the pre-edit employee record against the submitted form data
// and returns a short list of what changed, e.g.
// ["status: In Office → On Leave", "Position", "Phone"]. Status changes
// are called out with their before/after values specifically (per the
// requirement to log status changes); every other changed field is just
// named, to keep the log message short.
function describeEmployeeChanges(before, afterData){
  var fields = [
    {key:'firstName', dataKey:'FirstName', label:'First Name'},
    {key:'middleName', dataKey:'MiddleName', label:'Middle Name'},
    {key:'lastName', dataKey:'LastName', label:'Last Name'},
    {key:'email', dataKey:'email', label:'Email'},
    {key:'phone', dataKey:'phone', label:'Phone'},
    {key:'position', dataKey:'position', label:'Position'},
    {key:'division', dataKey:'division', label:'Division'},
    {key:'employeeType', dataKey:'employeeType', label:'Employee Type'},
    {key:'status', dataKey:'status', label:'Status'},
    {key:'dateHired', dataKey:'dateHired', label:'Date Hired'}
  ];
  var changed = [];
  fields.forEach(function(f){
    var oldVal = (before[f.key] || '').toString();
    var newVal = (afterData[f.dataKey] || '').toString();
    if(oldVal === newVal) return;
    changed.push(f.key === 'status' ? ('status: ' + (oldVal || '—') + ' \u2192 ' + (newVal || '—')) : f.label);
  });
  return changed;
}

// Shared Add/Edit modal. Call with no arguments to add a new employee,
// or pass an existing record (from the `employees` array) to edit it in
// place. Employee ID and Created date are never user-editable: the
// backend generates the ID (so the Add form has no ID field at all), and
// on Edit it's shown disabled, for reference only. createdAt has no field
// at all — it's preserved server-side automatically.
function openEmployeeForm(employee) {
  var isEdit = !!(employee && employee.id);

  var statusOptions = Object.keys(statusMeta)
    .map(function(s){
      return '<option value="' + s + '"' + (isEdit && s === employee.status ? ' selected' : '') + '>' + s + '</option>';
    }).join('');

  var employeeTypeOptions = ['Regular', 'Job Order', 'Contract of Service', 'Casual']
    .map(function(t){
      return '<option' + (isEdit && t === employee.employeeType ? ' selected' : '') + '>' + t + '</option>';
    }).join('');

  // Employee ID is backend-generated, so it's only ever shown — never
  // entered — and only on Edit, where it's there purely for reference.
  var idFieldHtml = isEdit
    ? '<div class="form-group">' +
        '<label>Employee ID</label>' +
        '<input type="text" id="fEmployeeID" value="'+escapeHtml(employee.id)+'" disabled>' +
      '</div>'
    : '';

  var bodyHtml =
    '<div class="form-grid">' +

      idFieldHtml +

      '<div class="form-group">' +
        '<label>First Name</label>' +
        '<input type="text" id="fFirstName" value="'+escapeHtml(isEdit ? employee.firstName : '')+'">' +
      '</div>' +

      '<div class="form-group">' +
        '<label>Middle Name</label>' +
        '<input type="text" id="fMiddleName" value="'+escapeHtml(isEdit ? employee.middleName : '')+'">' +
      '</div>' +

      '<div class="form-group">' +
        '<label>Last Name</label>' +
        '<input type="text" id="fLastName" value="'+escapeHtml(isEdit ? employee.lastName : '')+'">' +
      '</div>' +

      '<div class="form-group">' +
        '<label>Email</label>' +
        '<input type="email" id="fEmail" value="'+escapeHtml(isEdit ? employee.email : '')+'">' +
      '</div>' +

      '<div class="form-group">' +
        '<label>Phone</label>' +
        '<input type="text" id="fPhone" value="'+escapeHtml(isEdit ? employee.phone : '')+'">' +
      '</div>' +

      '<div class="form-group">' +
        '<label>Position</label>' +
        '<input type="text" id="fPosition" value="'+escapeHtml(isEdit ? employee.position : '')+'">' +
      '</div>' +

      '<div class="form-group">' +
        '<label>Division</label>' +
        '<input type="text" id="fDivision" value="'+escapeHtml(isEdit ? employee.division : '')+'">' +
      '</div>' +

      '<div class="form-group">' +
        '<label>Employee Type</label>' +
        '<select id="fEmployeeType">' +
          employeeTypeOptions +
        '</select>' +
      '</div>' +

      '<div class="form-group">' +
        '<label>Status</label>' +
        '<select id="fStatus">' +
          statusOptions +
        '</select>' +
      '</div>' +

      '<div class="form-group">' +
        '<label>Date Hired</label>' +
        '<input type="date" id="fDateHired" value="'+escapeHtml(isEdit ? employee.dateHired : '')+'">' +
      '</div>' +

      '<div class="form-group" style="grid-column:1 / span 2;">' +
        '<label>Photo</label>' +
        '<input type="file" id="fPhotoFile" accept="image/*">' +
        '<div id="fPhotoPreviewWrap" style="margin-top:8px;">' +
          (isEdit && employee.photo
            ? '<img src="'+photoUrl(employee.photo)+'" alt="" style="width:56px; height:56px; border-radius:50%; object-fit:cover;">'
            : '') +
        '</div>' +
      '</div>' +

    '</div>' +

    '<div class="form-error" id="fEmpError">' +
      'First Name and Last Name are required.' +
    '</div>';

  openModal(isEdit ? "Edit Employee" : "Add Employee", bodyHtml, async function(){

    const empError = document.getElementById("fEmpError");

    const employeeData = {

        FirstName: document.getElementById("fFirstName").value.trim(),

        MiddleName: document.getElementById("fMiddleName").value.trim(),

        LastName: document.getElementById("fLastName").value.trim(),

        email: document.getElementById("fEmail").value.trim(),

        phone: document.getElementById("fPhone").value.trim(),

        position: document.getElementById("fPosition").value.trim(),

        division: document.getElementById("fDivision").value,

        employeeType: document.getElementById("fEmployeeType").value,

        status: document.getElementById("fStatus").value,

        // Keeps the existing photo unless a new file is picked below —
        // there's no more text field for this, it's only ever set by
        // upload.
        photo: isEdit ? (employee.photo || "") : "",

        dateHired: document.getElementById("fDateHired").value

    };

    if (!employeeData.FirstName || !employeeData.LastName) {

        empError.textContent = "First Name and Last Name are required.";
        empError.classList.add("show");

        return false;

    }

    const photoFile = document.getElementById("fPhotoFile").files[0];

    if (photoFile) {

        if (photoFile.size > 5 * 1024 * 1024) {

            empError.textContent = "Photo must be smaller than 5MB.";
            empError.classList.add("show");

            return false;

        }

        employeeData.photoData = await fileToBase64(photoFile);
        employeeData.photoName = photoFile.name;

    }

    const result = isEdit
      ? await updateEmployee(Object.assign({ employeeID: employee.id }, employeeData))
      : await addEmployee(employeeData);

    if (!result.success) {

        alert(result.message);

        return false;

    }

    var fullName = (employeeData.FirstName + ' ' + employeeData.LastName).trim();

    if (isEdit) {
        var changes = describeEmployeeChanges(employee, employeeData);
        if (employeeData.photoData) changes.push('photo');
        var updateMsg = changes.length
            ? 'Updated employee ' + fullName + ' — changed ' + changes.join(', ') + '.'
            : 'Updated employee ' + fullName + '.';
        logActivity('Employees', 'Update', employee.id, updateMsg);
    } else {
        var newId = (result.data && result.data.employeeID) || '';
        logActivity('Employees', 'Create', newId, 'Added employee ' + fullName + (employeeData.position ? ' as ' + employeeData.position : '') + '.');
    }

    await loadEmployees();

  });

  var photoFileInput = document.getElementById('fPhotoFile');
  if(photoFileInput){
    photoFileInput.addEventListener('change', function(){
      var file = photoFileInput.files && photoFileInput.files[0];
      var wrap = document.getElementById('fPhotoPreviewWrap');
      if(!file || !wrap) return;
      wrap.innerHTML = '<img src="'+URL.createObjectURL(file)+'" alt="" style="width:56px; height:56px; border-radius:50%; object-fit:cover;">';
    });
  }
}
document.getElementById('btnNewEmployee').addEventListener('click', function(){ openEmployeeForm(); });
loadEmployees();