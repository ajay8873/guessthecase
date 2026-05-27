const SUPABASE_URL = 'https://lqzybdxtaqzpirdkaegf.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_4WUJG04ET75Wr8T0B24Yzg_gP5Ye4xX';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.supabaseClient = supabaseClient;

// Check if already logged in -> redirect to index.html
supabaseClient.auth.getSession().then(({ data: { session } }) => {
  if (session) {
    window.location.href = 'index.html';
  }
});

// Setup auth listener to instantly redirect if session pops in
supabaseClient.auth.onAuthStateChange((event, session) => {
  if (session) {
    window.location.href = 'index.html';
  }
});

const form = document.getElementById('login-form');
const nameGroup = document.getElementById('name-group');
const nameInput = document.getElementById('name');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const passwordGroup = document.getElementById('password-group');
const submitBtn = document.getElementById('btn-submit');
const toggleModeBtn = document.getElementById('btn-toggle-mode');
const forgotBtn = document.getElementById('btn-forgot');
const forgotContainer = document.getElementById('forgot-pass-container');
const subtitle = document.getElementById('auth-subtitle');
const footerText = document.getElementById('footer-text');
const errorMsg = document.getElementById('auth-error');
const successMsg = document.getElementById('auth-success');

let mode = 'login'; // 'login', 'signup', 'forgot'

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.style.display = 'block';
  successMsg.style.display = 'none';
}

function showSuccess(msg) {
  successMsg.textContent = msg;
  successMsg.style.display = 'block';
  errorMsg.style.display = 'none';
}

function clearMessages() {
  errorMsg.style.display = 'none';
  successMsg.style.display = 'none';
}

if (toggleModeBtn) {
  toggleModeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    clearMessages();
    if (mode === 'login' || mode === 'forgot') {
      // If we are in login or forgot password mode, switch to Signup
      mode = 'signup';
      subtitle.textContent = 'Create a new account';
      submitBtn.textContent = 'Sign Up';
      footerText.textContent = 'Already have an account? ';
      toggleModeBtn.textContent = 'Sign In';
      forgotContainer.style.display = 'none';
      nameGroup.style.display = 'block';
      nameInput.required = true;
      passwordGroup.style.display = 'block';
      passwordInput.required = true;
    } else {
      // If we are in signup mode, switch back to Login
      mode = 'login';
      subtitle.textContent = 'Sign in to start diagnosing';
      submitBtn.textContent = 'Sign In';
      footerText.textContent = "Don't have an account? ";
      toggleModeBtn.textContent = 'Sign Up';
      forgotContainer.style.display = 'block';
      nameGroup.style.display = 'none';
      nameInput.required = false;
      passwordGroup.style.display = 'block';
      passwordInput.required = true;
    }
  });
}

if (forgotBtn) {
  forgotBtn.addEventListener('click', (e) => {
    e.preventDefault();
    clearMessages();
    mode = 'forgot';
    subtitle.textContent = 'Reset your password';
    submitBtn.textContent = 'Send Reset Link';
    passwordGroup.style.display = 'none';
    passwordInput.required = false;
    nameGroup.style.display = 'none';
    nameInput.required = false;
    forgotContainer.style.display = 'none';
    
    footerText.textContent = '';
    toggleModeBtn.textContent = 'Back to Sign In';
  });
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMessages();
  submitBtn.disabled = true;
  submitBtn.style.opacity = '0.7';

  const email = emailInput.value;
  const password = passwordInput.value;

  try {
    if (mode === 'login') {
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      window.location.href = 'index.html';
      
    } else if (mode === 'signup') {
      const fullName = nameInput.value;
      const { data, error } = await supabaseClient.auth.signUp({ 
        email, 
        password,
        options: {
          data: {
            full_name: fullName
          }
        }
      });
      if (error) throw error;

      if (data && data.session) {
        showSuccess('Signup successful! Redirecting...');
        setTimeout(() => {
          window.location.href = 'index.html';
        }, 1500);
      } else {
        showSuccess('Signup successful! Please check your email for a verification link, then sign in.');
        
        // Auto-switch to login mode to make it easy for them
        mode = 'login';
        subtitle.textContent = 'Sign in to start diagnosing';
        submitBtn.textContent = 'Sign In';
        passwordGroup.style.display = 'block';
        passwordInput.required = true;
        nameGroup.style.display = 'none';
        nameInput.required = false;
        forgotContainer.style.display = 'block';
        footerText.textContent = "Don't have an account? ";
        toggleModeBtn.textContent = 'Sign Up';
      }
      
    } else if (mode === 'forgot') {
      const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/login.html',
      });
      if (error) throw error;
      showSuccess('Password reset link sent to your email.');
    }
  } catch (err) {
    showError(err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.style.opacity = '1';
  }
});
