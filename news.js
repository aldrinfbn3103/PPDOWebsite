/* =======================================================================
   news.js — News & Announcements: fetch/render from the Apps Script API,
   the create/update/delete CRUD flows, image uploads, and the read-only
   detail modal.

   Depends on api.js (API_URL, escapeHtml, openModal/closeModal) and
   dashboard.js (reads the adminSignedIn flag to show edit/delete actions
   in the detail modal). Load this file LAST.
   ======================================================================= */

/* ---------------- Sample data ---------------- */
let newsData = [];
var newsSeq = 7;

// news card modified
function newsCard(n){

    const thumbStyle = n.image
        ? `style="background-image:url('${n.image}')"`
        : "";

    return `
        <div class="card news-card" data-news-id="${n.id}" onclick="openNewsDetail('${n.id}')">

            <div class="news-thumb ${n.image ? 'has-image' : ''}" ${thumbStyle}>
                <span>${n.category}</span>
            </div>

            <div class="news-date">
                ${new Date(n.date).toLocaleDateString('en-US',{
                    year:'numeric',
                    month:'long',
                    day:'numeric'
                })}
            </div>

            <h4>${n.title}</h4>

            <p>${n.summary}</p>

        </div>
    `;

}
// render news function modified
function renderNews(){

    const activeChip = document.querySelector("#newsFilters .chip.active");

    const category = activeChip
        ? activeChip.dataset.tag
        : "All";

    let filtered = newsData;

    if(category !== "All"){

        filtered = newsData.filter(item =>
            item.category === category
        );

    }

    document.getElementById("newsGrid").innerHTML =
        filtered.map(newsCard).join("");

    document.getElementById("dashNews").innerHTML =
        newsData
        .slice(0,3)
        .map(newsCard)
        .join("");

}

async function loadNews() {

    try {

        const response = await fetch(API_URL);
        const data = await response.json();

        console.log("API Data:", data);

        newsData = data;

        console.log("newsData:", newsData);

        renderNews();

        // Feeds the "Documents published this month" overview card on the
        // main dashboard with the real count, now that news data is in.
        if (typeof refreshDocsPublishedStat === 'function') refreshDocsPublishedStat();

    } catch(error) {

        console.error("Unable to load news:", error);

    }

}

loadNews();

/* News filter chips */
(function(){
  var newsFilters = document.getElementById('newsFilters');
  if(!newsFilters) return;
  newsFilters.addEventListener('click', function(e){
    var chip = e.target.closest('.chip');
    if(!chip || !newsFilters.contains(chip)) return;
    newsFilters.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));
    chip.classList.add('active');
    renderNews();
  });
})();

/* =======================================================================
   News & Announcements: view, create, update, delete, image upload
   ======================================================================= */
function friendlyToday(){
  return new Date().toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric'});
}

function newsImageUploadHtml(currentImages){
  var imgs = currentImages || [];
  var previewItems = imgs.map(function(src, idx){
    return '<div class="image-preview-item" data-img-idx="'+idx+'"><img src="'+src+'" alt=""><button type="button" class="image-remove-btn" data-img-remove="'+idx+'">✕</button></div>';
  }).join('');
  return ''
    + '<div class="form-group"><label>Photos / attachments (optional)</label>'
    + '<div class="image-drop"><input type="file" id="fNewsImage" accept="image/*" multiple><span class="image-drop-label">📷 Click or drag images here to attach (multiple allowed)</span></div>'
    + '<div class="image-preview-grid" id="newsImagePreviewGrid">'+previewItems+'</div>'
    + '<div class="form-hint">JPG or PNG. The first photo appears on the announcement card; all photos appear in the detail gallery.</div>'
    + '</div>';
}

function wireNewsImageUpload(initialImages){
  var currentImages = (initialImages || []).slice();
  var fileInput = document.getElementById('fNewsImage');
  var previewGrid = document.getElementById('newsImagePreviewGrid');

  function renderPreviewGrid(){
    previewGrid.innerHTML = currentImages.map(function(src, idx){
      return '<div class="image-preview-item" data-img-idx="'+idx+'"><img src="'+src+'" alt=""><button type="button" class="image-remove-btn" data-img-remove="'+idx+'">✕</button></div>';
    }).join('');
    previewGrid.querySelectorAll('[data-img-remove]').forEach(function(btn){
      btn.addEventListener('click', function(){
        currentImages.splice(Number(btn.dataset.imgRemove), 1);
        renderPreviewGrid();
      });
    });
  }
  renderPreviewGrid();

  if(fileInput){
    fileInput.addEventListener('change', function(){
      var files = Array.from(fileInput.files || []);
      if(!files.length) return;
      var remaining = files.length;
      files.forEach(function(file){
        if(!file.type.match('image.*')){
          remaining--;
          return;
        }
        var reader = new FileReader();
        reader.onload = function(e){
          currentImages.push(e.target.result);
          renderPreviewGrid();
        };
        reader.readAsDataURL(file);
      });
      fileInput.value = '';
    });
  }
  return function getImagesData(){ return currentImages; };
}
// ACTION FOR ADD NEWS
async function saveNewsToDatabase(news) {

    const formData = new FormData();

    formData.append("action", "addNews");

    Object.keys(news).forEach(key => {
        formData.append(key, news[key]);
    });

    const response = await fetch(API_URL, {
        method: "POST",
        body: formData
    });

    return await response.json();
}

// ACTION FOR UPDATE NEWS
async function updateNewsInDatabase(news) {

    const formData = new FormData();

    formData.append("action", "updateNews");

    Object.keys(news).forEach(key => {
        formData.append(key, news[key]);
    });

    const response = await fetch(API_URL, {
        method: "POST",
        body: formData
    });

    return await response.json();

}

// ACTION FOR DELETE NEWS
async function deleteNewsFromDatabase(id) {

    const formData = new FormData();

    formData.append("action", "deleteNews");
    formData.append("id", id);

    const response = await fetch(API_URL, {
        method: "POST",
        body: formData
    });

    return await response.json();

}

/* Add / Edit announcement form (shared) */
function openNewsForm(existingId){
  var existing = existingId ? newsData.find(function(n){ return String(n.id) === String(existingId); }) : null;
  var tagOptions = ['Advisory','Project Update','Public Notice','Event'].map(function(t){
    return '<option value="'+t+'"'+(existing && existing.category===t ? ' selected':'')+'>'+t+'</option>';
  }).join('');

  var bodyHtml =
    '<div class="form-group"><label>Title</label><input type="text" id="fNewsTitle" placeholder="e.g. New hazard maps released" value="'+escapeHtml(existing?existing.title:'')+'"></div>'
    + '<div class="form-row">'
    + '<div class="form-group"><label>Category</label><select id="fNewsTag">'+tagOptions+'</select></div>'
    + '<div class="form-group"><label>Date</label><input type="text" id="fNewsDate" placeholder="e.g. Jul 3, 2026" value="'+escapeHtml(existing?existing.date:friendlyToday())+'"></div>'
    + '</div>'
    + '<div class="form-group"><label>Content</label><textarea id="fNewsBody" placeholder="Write the announcement details…" style="min-height:110px">'+escapeHtml(existing ? existing.content:'')+'</textarea></div>'
    + newsImageUploadHtml(existing && existing.image ? [existing.image] : [])
    + '<div class="form-error" id="fNewsError">Please enter a title and content for the announcement.</div>';

  var getImagesData = null;
  openModal(existing ? 'Update Announcement' : 'New Announcement', bodyHtml, async function(){
    var title = document.getElementById('fNewsTitle').value.trim();
    var tag = document.getElementById('fNewsTag').value;
    var date = document.getElementById('fNewsDate').value.trim() || friendlyToday();
    var body = document.getElementById('fNewsBody').value.trim();
    if(!title || !body){
      document.getElementById('fNewsError').classList.add('show');
      return false;
    }
    var images = getImagesData ? getImagesData() : [];
 
    // Need fixing
  
    if(existing){

    const newsObject = {

        id: existing.id,
        title: title,
        category: tag,
        date: date,
        summary: body.substring(0,120),
        content: body,
        image: images.length ? images[0] : "",
        attachment: existing.attachment || "",
        featured: existing.featured || false,
        status: existing.status || "Published",
        author: existing.author || "PPDO"

    };

    if(!newsObject.id){
        alert("Cannot update: this announcement has no ID.");
        return false;
    }

    try{

        const result = await updateNewsInDatabase(newsObject);

        console.log("Update Result:", result);

        if(result && result.success){
            Object.assign(existing, newsObject); // reflect the change immediately, even if the reload below is slow/fails
            logActivity('News', 'Update', String(newsObject.id), 'Updated announcement "' + title + '".');
            await loadNews();
        }else{
            alert((result && result.message) || "Failed to update announcement.");
            return false; // keep the modal open so the edits aren't lost
        }

    }catch(err){

        console.error(err);
        alert("Failed to update announcement. Please check your connection and try again.");
        return false;

    }

}else{

    const newsObject = {

        title: title,
        category: tag,
        date: date,
        summary: body.substring(0,120),
        content: body,
        image: images.length ? images[0] : "",
        attachment: "",
        featured: false,
        status: "Published",
        author: "PPDO"

    };

    try{

        const result = await saveNewsToDatabase(newsObject);

        console.log(result);

        if(result && result.success){
            var newNewsId = (result.data && result.data.id) || (result.id) || '';
            logActivity('News', 'Create', String(newNewsId), 'Published announcement "' + title + '".');
            await loadNews();
        }else{
            alert((result && result.message) || "Failed to publish announcement.");
            return false; // keep the modal open so the entry isn't lost
        }

    }catch(err){

        console.error(err);
        alert("Failed to publish announcement. Please check your connection and try again.");
        return false;

    }

}
  });
  // wire the image upload after the modal body is in the DOM
  getImagesData = wireNewsImageUpload(
    existing && existing.image ? [existing.image] : []
);
}

/* Pick-then-edit / pick-then-delete flows for the top toolbar buttons */
function newsPickerOptions(){
  return newsData.map(function(n){
    return '<option value="'+n.id+'">'+escapeHtml(n.title)+' — '+escapeHtml(n.date)+'</option>';
  }).join('');
}

function openNewsEditPicker(){
  if(!newsData.length){
    alert('There are no announcements to update yet.');
    return;
  }
  var bodyHtml = '<div class="form-group"><label>Choose an announcement to update</label><select id="fNewsPickEdit">'+newsPickerOptions()+'</select></div>'
    + '<div class="form-hint">You\'ll be able to edit the title, category, date, content, and photos on the next screen.</div>';
  openModal('Update Announcement', bodyHtml, function(){
    var id = document.getElementById('fNewsPickEdit').value;
    openNewsForm(id);
  }, {saveLabel:'Continue'});
}

function openNewsDeletePicker(){
  if(!newsData.length){
    alert('There are no announcements to delete.');
    return;
  }
  var bodyHtml = '<div class="form-group"><label>Choose an announcement to delete</label><select id="fNewsPickDelete">'+newsPickerOptions()+'</select></div>'
    + '<div class="form-hint">This will permanently remove the announcement from the site.</div>';
  openModal('Delete Announcement', bodyHtml, async function(){
    var id = document.getElementById('fNewsPickDelete').value;
    var item = newsData.find(function(n){ return String(n.id) === String(id); });
    if(item && !confirm('Delete "'+item.title+'"? This cannot be undone.')) return false;
    try{
      const result = await deleteNewsFromDatabase(id);
      if(result && result.success){
        logActivity('News', 'Delete', String(id), 'Deleted announcement "' + (item ? item.title : id) + '".');
        await loadNews();
      }else{
        alert((result && result.message) || "Failed to delete announcement.");
        return false;
      }
    }catch(err){
      console.error(err);
      alert("Failed to delete announcement. Please check your connection and try again.");
      return false;
    }
  }, {saveLabel:'Continue', saveClass:'btn btn-danger'});
}

/* Read-only detail modal, opened by clicking a news card */
function openNewsDetail(id){
  var n = newsData.find(function(x){ return x.id === id; });
  if(!n) return;
  var imgs = n.image ? [n.image] : [];
  var galleryHtml;
  if(imgs.length){
    var mainStyle = ' style="background-image:url(\''+imgs[0]+'\')"';
    var thumbs = imgs.length > 1
      ? '<div class="news-gallery-thumbs">'+imgs.map(function(src, idx){
          return '<img src="'+src+'" data-gallery-idx="'+idx+'" class="'+(idx===0?'active':'')+'">';
        }).join('')+'</div>'
      : '';
    galleryHtml = '<div class="news-gallery"><div class="news-gallery-main" id="newsGalleryMain"'+mainStyle+'></div>'+thumbs+'</div>';
  } else {
    galleryHtml = '<div class="news-detail-thumb"></div>';
  }
  var adminActions = adminSignedIn
    ? '<div class="news-detail-admin-actions">'
      + '<button class="btn btn-outline" id="fNewsDetailEdit">Update this announcement</button>'
      + '<button class="btn btn-danger" id="fNewsDetailDelete">Delete this announcement</button>'
      + '</div>'
    : '';
  var bodyHtml =
    galleryHtml
    + '<div class="news-detail-meta"><span class="news-detail-tag">'
    + escapeHtml(n.category)
    + '</span><span class="news-detail-date">'
    + new Date(n.date).toLocaleDateString('en-US',{
        year:'numeric',
        month:'long',
        day:'numeric'
    })
    + '</span></div>'
    + '<div class="news-detail-body">'
    + escapeHtml(n.content)
    + '</div>'
    + adminActions;

  openModal(n.title, bodyHtml, null, {wide:true, hideFoot:true});

  if(imgs.length > 1){
    var mainEl = document.getElementById('newsGalleryMain');
    modalBody.querySelectorAll('[data-gallery-idx]').forEach(function(thumb){
      thumb.addEventListener('click', function(){
        modalBody.querySelectorAll('[data-gallery-idx]').forEach(t=>t.classList.remove('active'));
        thumb.classList.add('active');
        mainEl.style.backgroundImage = "url('"+imgs[Number(thumb.dataset.galleryIdx)]+"')";
      });
    });
  }

  var editBtn = document.getElementById('fNewsDetailEdit');
  var delBtn = document.getElementById('fNewsDetailDelete');
  if(editBtn) editBtn.addEventListener('click', function(){
    closeModal();
    openNewsForm(n.id);
  });
  if(delBtn) delBtn.addEventListener('click', async function(){
    if(!confirm('Delete "'+n.title+'"? This cannot be undone.')) return;
    delBtn.disabled = true;
    try{
      const result = await deleteNewsFromDatabase(n.id);
      if(result && result.success){
        closeModal();
        await loadNews();
      }else{
        alert((result && result.message) || "Failed to delete announcement.");
        delBtn.disabled = false;
      }
    }catch(err){
      console.error(err);
      alert("Failed to delete announcement. Please check your connection and try again.");
      delBtn.disabled = false;
    }
  });
}

/* Wire the admin toolbar buttons on the News page */
(function(){
  var btnNewPost = document.getElementById('btnNewPost');
  var btnDelete = document.getElementById('btnDelete');
  if(btnNewPost) btnNewPost.addEventListener('click', function(){ openNewsForm(null); });
  if(btnDelete) btnDelete.addEventListener('click', openNewsDeletePicker);
})();