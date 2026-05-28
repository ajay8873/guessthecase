// auth.js - Session Management for index.html

const SUPABASE_URL = 'https://lqzybdxtaqzpirdkaegf.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_4WUJG04ET75Wr8T0B24Yzg_gP5Ye4xX';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.supabaseClient = supabaseClient;

// Force redirect to login if not authenticated
supabaseClient.auth.getSession().then(({ data: { session } }) => {
  if (!session) {
    window.location.href = 'login.html';
  } else {
    // Populate account info
    const emailDisplay = document.getElementById('account-email-display');
    if (emailDisplay) emailDisplay.textContent = session.user.email;
    
    const nameDisplay = document.getElementById('account-name-display');
    const nameInput = document.getElementById('account-full-name');
    const fullName = session.user.user_metadata?.full_name || 'Not set';
    if (nameDisplay) nameDisplay.textContent = fullName;
    if (nameInput) nameInput.value = fullName === 'Not set' ? '' : fullName;

    // Sync statistics from the cloud
    if (window.loadStatsFromCloud && session.user.id) {
      window.loadStatsFromCloud(session.user.id);
    }

    // Fetch all cases from the database
    supabaseClient.from('cases').select('*').then(({ data: cases, error }) => {
      if (!error && cases && cases.length > 0 && window.ALL_CASES) {
        // Sort cases stably by created_at (ascending) or id as fallback to ensure IDs are consistent on all devices
        cases.sort((a, b) => {
          const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
          if (timeA !== timeB) return timeA - timeB;
          const idA = a.id ? String(a.id) : '';
          const idB = b.id ? String(b.id) : '';
          return idA.localeCompare(idB);
        });

        const dbCasesList = [];
        cases.forEach((c, idx) => {
          const caseObj = {
            id: 1000 + idx, // Virtual integer ID to support routing
            dbId: c.id,     // Actual Supabase UUID
            name: c.name,
            synonyms: c.synonyms,
            initialClue: c.initial_clue,
            symptoms: c.symptoms,
            description: c.description,
            anki1: c.anki1,
            anki2: c.anki2,
            nejmLink: c.nejm_link,
            subject: c.subject || 'Miscellaneous'
          };
          dbCasesList.push(caseObj);

          // Check if this case name is already in ALL_CASES to avoid duplicates
          const exists = window.ALL_CASES.some(existing => existing.name.toLowerCase() === c.name.toLowerCase());
          if (!exists) {
            window.ALL_CASES.push(caseObj);
          }
        });

        // Cache database cases to local storage for synchronous loading on next page load
        localStorage.setItem('doctoraj_db_cases', JSON.stringify(dbCasesList));
        
        // If the archive modal is open, refresh the view
        const archiveModal = document.getElementById('archive-modal');
        if (archiveModal && archiveModal.classList.contains('modal-visible') && window.openArchive) {
          window.openArchive(false);
        }
      }
    });
  }
});

supabaseClient.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT' || !session) {
    window.location.href = 'login.html';
  }
});

// UI Elements
const authAccountBtn = document.getElementById('auth-account-btn');
const authLogoutBtn = document.getElementById('auth-logout-btn');
const authLoginBtn = document.getElementById('auth-login-btn'); // Will hide this

if (authLoginBtn) authLoginBtn.style.display = 'none';
if (authAccountBtn) authAccountBtn.style.display = 'block';
if (authLogoutBtn) authLogoutBtn.style.display = 'block';

// Account Modal Elements
const accountModal = document.getElementById('account-settings-modal');
const closeAccountModalBtn = document.getElementById('close-account-modal');
const accountPasswordForm = document.getElementById('account-password-form');
const accountNewPassword = document.getElementById('account-new-password');
const accountError = document.getElementById('account-error');
const accountSuccess = document.getElementById('account-success');

// Log out
if (authLogoutBtn) {
  authLogoutBtn.addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
  });
}

// Account Settings Modal
if (authAccountBtn && accountModal) {
  authAccountBtn.addEventListener('click', () => {
    accountModal.classList.remove('modal-hidden');
    accountModal.classList.add('modal-visible');
  });
}

if (closeAccountModalBtn && accountModal) {
  closeAccountModalBtn.addEventListener('click', () => {
    accountModal.classList.add('modal-hidden');
    accountModal.classList.remove('modal-visible');
    if (accountError) accountError.style.display = 'none';
    if (accountSuccess) accountSuccess.style.display = 'none';
  });
}

// Change Password Form
if (accountPasswordForm) {
  accountPasswordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (accountError) accountError.style.display = 'none';
    if (accountSuccess) accountSuccess.style.display = 'none';
    
    const newPassword = accountNewPassword.value;
    const submitBtn = accountPasswordForm.querySelector('button');
    submitBtn.disabled = true;
    
    try {
      const { error } = await supabaseClient.auth.updateUser({
        password: newPassword
      });
      
      if (error) throw error;
      
      if (accountSuccess) {
        accountSuccess.textContent = 'Password updated successfully!';
        accountSuccess.style.display = 'block';
      }
      accountPasswordForm.reset();
    } catch (err) {
      if (accountError) {
        accountError.textContent = err.message;
        accountError.style.display = 'block';
      }
    } finally {
      submitBtn.disabled = false;
    }
  });
}

// Change Profile Form
const accountProfileForm = document.getElementById('account-profile-form');
const accountFullName = document.getElementById('account-full-name');
const nameDisplay = document.getElementById('account-name-display');

if (accountProfileForm) {
  accountProfileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (accountError) accountError.style.display = 'none';
    if (accountSuccess) accountSuccess.style.display = 'none';
    
    const newName = accountFullName.value;
    const submitBtn = accountProfileForm.querySelector('button');
    submitBtn.disabled = true;
    
    try {
      const { error } = await supabaseClient.auth.updateUser({
        data: { full_name: newName }
      });
      
      if (error) throw error;
      
      if (nameDisplay) nameDisplay.textContent = newName;
      if (accountSuccess) {
        accountSuccess.textContent = 'Name updated successfully!';
        accountSuccess.style.display = 'block';
      }
    } catch (err) {
      if (accountError) {
        accountError.textContent = err.message;
        accountError.style.display = 'block';
      }
    } finally {
      submitBtn.disabled = false;
    }
  });
}
