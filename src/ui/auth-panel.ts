import {
  changeNickname,
  displayName,
  getCurrentUser,
  isLoggedIn,
  login,
  logout,
  nicknameCooldownMs,
  register,
} from '../account';
import { fetchHall, fetchMyBadges } from '../badge-api';
import { badgeChip } from './trophy';
import { hideModal, showModal } from './modal';

/**
 * 账户 UI：顶栏账户按钮（未登录=登录入口，已登录=资料入口）、
 * 登录/注册弹窗、个人资料弹窗（用户名=不可变 ID，昵称 3 天冷却可改）。
 * 登录成功后执行挂起操作（如未登录时点了「进入游戏」）。
 */

type Pending = () => void;

let pending: Pending | null = null;
let loginChangeCb: (() => void) | null = null;
let bound = false;

function el<T extends HTMLElement = HTMLElement>(id: string, _ctor?: new () => T): T {
  return document.getElementById(id) as T;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** 打开登录弹窗；登录成功后会执行 pending */
export function openAuth(after?: Pending): void {
  pending = after ?? null;
  renderAuthForm('login');
  showModal(el('modal-auth'));
}

export function onLoginChange(cb: () => void): void {
  loginChangeCb = cb;
}

export function refreshAccountEntry(): void {
  el('nav-profile').textContent = isLoggedIn() ? displayName() || '账户' : '登 录';
}

function initDom(): void {
  if (bound) return;
  bound = true;

  // 登录/注册弹窗：纵向表单、通栏大输入框
  el('modal-auth-body').innerHTML = `
    <div class="auth-brand">
      <span class="auth-brand-logo">DGC</span>
      <span class="auth-brand-sub" id="auth-brand-sub">登录以进入游戏</span>
    </div>
    <div class="auth-tabs">
      <button class="tab auth-tab active" data-mode="login">登 录</button>
      <button class="tab auth-tab" data-mode="register">注册新账户</button>
    </div>
    <div class="auth-form">
      <label class="auth-label" for="auth-user">用户名 ID</label>
      <input type="text" id="auth-user" maxlength="16" autocomplete="username" placeholder="3-16 位英文 / 数字 / 下划线" />
      <label class="auth-label" for="auth-pass">密码</label>
      <input type="password" id="auth-pass" maxlength="64" autocomplete="current-password" />
      <div id="auth-email-row" hidden>
        <label class="auth-label" for="auth-email">邮箱（选填）</label>
        <input type="text" id="auth-email" maxlength="64" placeholder="用于找回密码" />
      </div>
      <div class="auth-msg" id="auth-msg"></div>
      <button class="btn-gold btn-lg" id="auth-submit" style="width:100%">登 录</button>
      <div class="auth-server-row" style="margin-top:14px; padding-top:10px; border-top:1px dashed rgba(255,255,255,0.12)">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px">
          <span class="hint" style="font-size:12px">后台服务器地址</span>
          <button type="button" id="auth-server-toggle" style="font-size:11px; cursor:pointer; background:none; border:none; color:var(--gold, #f0c866)">配置服务器 ⚙</button>
        </div>
        <div id="auth-server-box" hidden>
          <div style="display:flex; gap:6px">
            <input type="text" id="auth-server-input" placeholder="https://dgb.yosoro.site" style="flex:1; font-size:12px; padding:6px 10px; border-radius:6px; border:1px solid rgba(255,255,255,0.15); background:rgba(0,0,0,0.3); color:#fff" />
            <button type="button" class="btn" id="auth-server-save" style="padding:6px 12px; font-size:12px">保存</button>
          </div>
          <div class="hint" id="auth-server-tip" style="font-size:11px; margin-top:4px; line-height:1.4">默认已内置服务器：https://dgb.yosoro.site。也可在此切换其他后台地址。</div>
        </div>
      </div>
    </div>`;
  el('modal-auth-body').querySelectorAll<HTMLElement>('.auth-tab').forEach((tab) => {
    tab.addEventListener('click', () => renderAuthForm(tab.dataset.mode as 'login' | 'register'));
  });
  el('auth-submit').addEventListener('click', () => void submitAuth());
  el('auth-pass').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void submitAuth();
  });

  const serverToggle = el('auth-server-toggle');
  const serverBox = el('auth-server-box');
  const serverInput = el('auth-server-input', HTMLInputElement);
  const serverSave = el('auth-server-save');
  serverInput.value = localStorage.getItem('dg-battle-server-url') || 'https://dgb.yosoro.site';
  serverToggle.addEventListener('click', () => {
    serverBox.hidden = !serverBox.hidden;
  });
  serverSave.addEventListener('click', () => {
    const val = serverInput.value.trim();
    if (val) {
      localStorage.setItem('dg-battle-server-url', val);
      el('auth-msg').textContent = '✅ 服务器地址已保存，请尝试登录或注册';
    } else {
      localStorage.removeItem('dg-battle-server-url');
      el('auth-msg').textContent = '已恢复默认服务器（https://dgb.yosoro.site）';
    }
    serverBox.hidden = true;
  });

  // 账户按钮：未登录→登录弹窗；已登录→通知 main 打开社交页自己板块
  el('nav-profile').addEventListener('click', () => {
    if (isLoggedIn()) {
      document.dispatchEvent(new CustomEvent('dg-open-self'));
    } else {
      openAuth();
    }
  });
}

let mode: 'login' | 'register' = 'login';

function renderAuthForm(m: 'login' | 'register'): void {
  mode = m;
  el('modal-auth-body').querySelectorAll<HTMLElement>('.auth-tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.mode === m);
  });
  el('auth-email-row').hidden = m === 'login';
  el('auth-submit').textContent = m === 'login' ? '登 录' : '注册并登录';
  el('auth-brand-sub').textContent = m === 'login' ? '登录以进入游戏' : '创建你的 DGC 账户';
  el('auth-msg').textContent = '';
  el('auth-pass').setAttribute('autocomplete', m === 'login' ? 'current-password' : 'new-password');
}

async function submitAuth(): Promise<void> {
  const username = (el('auth-user', HTMLInputElement).value ?? '').trim();
  const password = el('auth-pass', HTMLInputElement).value ?? '';
  const email = (el('auth-email', HTMLInputElement).value ?? '').trim();
  const msg = el('auth-msg');
  const btn = el('auth-submit', HTMLButtonElement);
  if (!username || !password) {
    msg.textContent = '请输入用户名和密码';
    return;
  }
  btn.disabled = true;
  msg.textContent = '';
  try {
    if (mode === 'login') await login(username, password);
    else await register(username, password, email);
    hideModal(el('modal-auth'));
    afterAuthChange();
  } catch (err) {
    msg.textContent = err instanceof Error ? err.message : String(err);
  } finally {
    btn.disabled = false;
  }
}

function afterAuthChange(): void {
  refreshAccountEntry();
  loginChangeCb?.();
  const cb = pending;
  pending = null;
  cb?.();
}

export function initAccountUi(): void {
  initDom();
  refreshAccountEntry();
}
