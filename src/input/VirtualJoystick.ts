export class VirtualJoystick {
  public vx = 0;
  public vy = 0;
  public sprinting = false;

  private keys = new Set<string>();
  private activePointerId: number | null = null;
  private center = { x: 0, y: 0 };
  private readonly maxRadius = 46;
  private onInteract: () => void;

  constructor(onInteract: () => void) {
    this.onInteract = onInteract;
    this.bindTouchJoystick();
    this.bindButtons();
    this.bindKeyboard();
  }

  private bindTouchJoystick(): void {
    const zone = document.getElementById('joystick-zone')!;
    const knob = document.getElementById('joystick-knob')!;

    const updateFromClient = (clientX: number, clientY: number) => {
      const dx = clientX - this.center.x;
      const dy = clientY - this.center.y;
      const dist = Math.hypot(dx, dy);
      const clamped = Math.min(dist, this.maxRadius);
      const angle = Math.atan2(dy, dx);
      const kx = Math.cos(angle) * clamped;
      const ky = Math.sin(angle) * clamped;
      knob.style.transform = `translate(${kx.toFixed(1)}px, ${ky.toFixed(1)}px)`;

      if (clamped > 8) {
        this.vx = Math.cos(angle) * (clamped / this.maxRadius);
        this.vy = Math.sin(angle) * (clamped / this.maxRadius);
      } else {
        this.vx = 0;
        this.vy = 0;
      }
    };

    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      zone.setPointerCapture(e.pointerId);
      this.activePointerId = e.pointerId;
      const rect = zone.getBoundingClientRect();
      this.center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      updateFromClient(e.clientX, e.clientY);
    });

    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.activePointerId) return;
      updateFromClient(e.clientX, e.clientY);
    });

    const release = (e: PointerEvent) => {
      if (e.pointerId !== this.activePointerId) return;
      this.activePointerId = null;
      this.vx = 0;
      this.vy = 0;
      knob.style.transform = 'translate(0px, 0px)';
    };

    zone.addEventListener('pointerup', release);
    zone.addEventListener('pointercancel', release);
  }

  private bindButtons(): void {
    const btnA = document.getElementById('btn-interact')!;
    const btnB = document.getElementById('btn-sprint')!;

    btnA.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.onInteract();
    });

    btnB.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.sprinting = true;
    });
    const stopSprint = () => {
      this.sprinting = false;
    };
    btnB.addEventListener('pointerup', stopSprint);
    btnB.addEventListener('pointercancel', stopSprint);
    btnB.addEventListener('pointerleave', stopSprint);
  }

  private bindKeyboard(): void {
    window.addEventListener('keydown', (e) => {
      if (document.activeElement?.tagName === 'INPUT') return;
      this.keys.add(e.key.toLowerCase());
      if (e.key === 'Shift') this.sprinting = true;
      if (e.key === ' ' || e.key === 'Enter' || e.key.toLowerCase() === 'e') {
        e.preventDefault();
        this.onInteract();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
      if (e.key === 'Shift') this.sprinting = false;
    });
  }

  getMovementVector(): { x: number; y: number; sprint: boolean } {
    if (this.activePointerId !== null && (Math.abs(this.vx) > 0.05 || Math.abs(this.vy) > 0.05)) {
      return { x: this.vx, y: this.vy, sprint: this.sprinting || Math.hypot(this.vx, this.vy) > 0.92 };
    }
    let kx = 0;
    let ky = 0;
    if (this.keys.has('arrowleft') || this.keys.has('a')) kx -= 1;
    if (this.keys.has('arrowright') || this.keys.has('d')) kx += 1;
    if (this.keys.has('arrowup') || this.keys.has('w')) ky -= 1;
    if (this.keys.has('arrowdown') || this.keys.has('s')) ky += 1;
    if (kx !== 0 && ky !== 0) {
      kx *= Math.SQRT1_2;
      ky *= Math.SQRT1_2;
    }
    return { x: kx, y: ky, sprint: this.sprinting };
  }
}
