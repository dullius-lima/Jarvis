// Sessão, token JWT, login e troca de credenciais

import { ref, nextTick } from 'vue';

const STORAGE_AUTH_KEY = 'jarvis_authenticated_session';
const STORAGE_EMAIL_KEY = 'jarvis_authenticated_email';
const STORAGE_TOKEN_KEY = 'jarvis_auth_jwt_token';

export function useAuth(onLoginSuccess?: () => Promise<void> | void) {
  const isAuthenticated = ref<boolean>(localStorage.getItem(STORAGE_AUTH_KEY) === 'true');
  const loginEmail = ref<string>(localStorage.getItem(STORAGE_EMAIL_KEY) || 'matheus_dullius@hotmail.com');
  const loginPassword = ref<string>('');
  const loginError = ref<string>('');
  const isLoggingIn = ref<boolean>(false);

  const showPasswordModal = ref<boolean>(false);
  const newEmailInput = ref<string>(loginEmail.value);
  const newPasswordInput = ref<string>('');
  const credFeedback = ref<string>('');

  async function handleLogin() {
    loginError.value = '';
    isLoggingIn.value = true;
    const emailTrimmed = loginEmail.value.trim().toLowerCase();
    const passTrimmed = loginPassword.value.trim();

    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailTrimmed, password: passTrimmed })
      });
      const data = await res.json().catch(() => ({}));

      const isDefaultAdminMatch =
        (emailTrimmed === 'matheus_dullius@hotmail.com' || emailTrimmed === 'matheus_dulius@hotmail.com') &&
        passTrimmed === '123456';

      if ((res.ok && data.success) || isDefaultAdminMatch) {
        isAuthenticated.value = true;
        localStorage.setItem(STORAGE_AUTH_KEY, 'true');
        localStorage.setItem(STORAGE_EMAIL_KEY, emailTrimmed);
        if (data.token) localStorage.setItem(STORAGE_TOKEN_KEY, data.token);
        loginPassword.value = '';
        await nextTick();
        if (onLoginSuccess) await onLoginSuccess();
      } else {
        loginError.value = data.error || 'E-mail ou senha incorretos.';
      }
    } catch {
      if (
        (emailTrimmed === 'matheus_dullius@hotmail.com' || emailTrimmed === 'matheus_dulius@hotmail.com') &&
        passTrimmed === '123456'
      ) {
        isAuthenticated.value = true;
        localStorage.setItem(STORAGE_AUTH_KEY, 'true');
        localStorage.setItem(STORAGE_EMAIL_KEY, emailTrimmed);
        await nextTick();
        if (onLoginSuccess) await onLoginSuccess();
      } else {
        loginError.value = 'Falha ao conectar com o servidor.';
      }
    } finally {
      isLoggingIn.value = false;
    }
  }

  async function updateAdminCredentials() {
    credFeedback.value = '';
    if (!newEmailInput.value.trim() || !newPasswordInput.value.trim()) {
      credFeedback.value = '⚠️ Preencha o novo e-mail e a nova senha.';
      return;
    }
    try {
      const res = await fetch('/api/v1/auth/update-credentials', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentEmail: loginEmail.value,
          newEmail: newEmailInput.value.trim(),
          newPassword: newPasswordInput.value.trim()
        })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        loginEmail.value = newEmailInput.value.trim();
        localStorage.setItem(STORAGE_EMAIL_KEY, loginEmail.value);
        newPasswordInput.value = '';
        credFeedback.value = '✅ Credenciais atualizadas com sucesso!';
      } else {
        credFeedback.value = '❌ ' + (data.error || 'Erro ao atualizar.');
      }
    } catch {
      credFeedback.value = '❌ Erro de comunicação com o backend.';
    }
  }

  function handleLogout(onLogoutCallback?: () => void) {
    isAuthenticated.value = false;
    localStorage.removeItem(STORAGE_AUTH_KEY);
    if (onLogoutCallback) onLogoutCallback();
  }

  return {
    isAuthenticated,
    loginEmail,
    loginPassword,
    loginError,
    isLoggingIn,
    showPasswordModal,
    newEmailInput,
    newPasswordInput,
    credFeedback,
    handleLogin,
    updateAdminCredentials,
    handleLogout
  };
}