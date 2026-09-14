import { InputState } from '../shared/protocol.js';

export interface InputHooks {
  onPotion: () => void;
  onDescend: () => void;
  onToggleGear: () => void;
  onToggleQuests: () => void;
}

/** Unified keyboard/mouse (PC) and virtual stick/buttons (mobile) input. */
export class InputController {
  readonly isTouch = matchMedia('(hover: none) and (pointer: coarse)').matches;

  private keys = new Set<string>();
  private mouseDown = false;
  private mouse = { x: 0, y: 0 };
  private stick = { x: 0, y: 0 };
  private stickPointer: number | null = null;
  private touchAttack = false;
  private touchDash = false;

  constructor(canvas: HTMLCanvasElement, hooks: InputHooks) {
    window.addEventListener('keydown', (event) => {
      if (event.target instanceof HTMLInputElement) return;
      const key = event.key.toLowerCase();
      this.keys.add(key);
      if (key === 'q') hooks.onPotion();
      if (key === 'e') hooks.onDescend();
      if (key === 'i') hooks.onToggleGear();
      if (key === 'j') hooks.onToggleQuests();
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) event.preventDefault();
    });
    window.addEventListener('keyup', (event) => this.keys.delete(event.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('mousemove', (event) => {
      this.mouse = { x: event.clientX, y: event.clientY };
    });
    canvas.addEventListener('mousedown', () => {
      this.mouseDown = true;
    });
    window.addEventListener('mouseup', () => {
      this.mouseDown = false;
    });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());

    const stickEl = document.getElementById('stick-move');
    const knob = stickEl?.querySelector<HTMLElement>('.knob');
    if (stickEl && knob) {
      const radius = 48;
      const update = (event: PointerEvent) => {
        const rect = stickEl.getBoundingClientRect();
        const dx = event.clientX - (rect.left + rect.width / 2);
        const dy = event.clientY - (rect.top + rect.height / 2);
        const len = Math.hypot(dx, dy) || 1;
        const clamped = Math.min(1, len / radius);
        this.stick = { x: (dx / len) * clamped, y: (dy / len) * clamped };
        knob.style.transform = `translate(${this.stick.x * radius}px, ${this.stick.y * radius}px)`;
      };
      stickEl.addEventListener('pointerdown', (event) => {
        this.stickPointer = event.pointerId;
        stickEl.setPointerCapture(event.pointerId);
        update(event);
      });
      stickEl.addEventListener('pointermove', (event) => {
        if (this.stickPointer === event.pointerId) update(event);
      });
      const release = (event: PointerEvent) => {
        if (this.stickPointer !== event.pointerId) return;
        this.stickPointer = null;
        this.stick = { x: 0, y: 0 };
        knob.style.transform = 'translate(0px, 0px)';
      };
      stickEl.addEventListener('pointerup', release);
      stickEl.addEventListener('pointercancel', release);
    }

    this.bindHold('btn-attack', (held) => {
      this.touchAttack = held;
    });
    this.bindHold('btn-dash', (held) => {
      this.touchDash = held;
    });
    document.getElementById('btn-potion')?.addEventListener('click', hooks.onPotion);
  }

  private bindHold(id: string, setter: (held: boolean) => void): void {
    const element = document.getElementById(id);
    if (!element) return;
    element.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      setter(true);
    });
    const stop = () => setter(false);
    element.addEventListener('pointerup', stop);
    element.addEventListener('pointerleave', stop);
    element.addEventListener('pointercancel', stop);
  }

  /** Aim direction is mouse-relative on PC and movement-relative on touch. */
  state(aim: { x: number; y: number }): InputState {
    let mx = this.stick.x;
    let my = this.stick.y;
    if (this.keys.has('a') || this.keys.has('arrowleft')) mx -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) mx += 1;
    if (this.keys.has('w') || this.keys.has('arrowup')) my -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) my += 1;
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }

    return {
      mx,
      my,
      aimX: aim.x,
      aimY: aim.y,
      attack: this.touchAttack || this.mouseDown || this.keys.has(' '),
      dash: this.touchDash || this.keys.has('shift'),
    };
  }

  get mousePosition(): { x: number; y: number } {
    return this.mouse;
  }

  get usingMouseAim(): boolean {
    return !this.isTouch;
  }
}
