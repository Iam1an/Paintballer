/** Lightweight visual effects that fade with opacity */
class EffectSystem {
  constructor() {
    this.effects = [];
  }

  /** Add an explosion at world position */
  explosion(x, y, radius) {
    this.effects.push({
      type: 'explosion', x, y, radius,
      life: 0.6, maxLife: 0.6,
    });
  }

  /** Add a heal burst at world position */
  healBurst(x, y, radius) {
    this.effects.push({
      type: 'heal', x, y, radius,
      life: 0.8, maxLife: 0.8,
    });
  }

  /** Add a melee slash arc */
  meleeSlash(x, y, angle) {
    this.effects.push({
      type: 'melee', x, y, angle,
      life: 0.25, maxLife: 0.25,
    });
  }

  update(dt) {
    for (const e of this.effects) e.life -= dt;
    this.effects = this.effects.filter(e => e.life > 0);
  }

  draw(ctx, camera) {
    for (const e of this.effects) {
      const sx = e.x - camera.x, sy = e.y - camera.y;
      const pct = e.life / e.maxLife; // 1 = fresh, 0 = gone
      const alpha = pct;

      switch (e.type) {
        case 'explosion': {
          const expandPct = 1 - pct;
          // Outer shockwave ring
          ctx.strokeStyle = `rgba(255, 150, 50, ${alpha * 0.6})`;
          ctx.lineWidth = 3 * pct;
          ctx.beginPath();
          ctx.arc(sx, sy, e.radius * (0.5 + expandPct * 0.5), 0, Math.PI * 2);
          ctx.stroke();

          // Inner fireball
          const fireRadius = e.radius * 0.6 * pct;
          const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, fireRadius);
          grad.addColorStop(0, `rgba(255, 240, 180, ${alpha * 0.9})`);
          grad.addColorStop(0.3, `rgba(255, 150, 40, ${alpha * 0.7})`);
          grad.addColorStop(0.7, `rgba(200, 60, 10, ${alpha * 0.4})`);
          grad.addColorStop(1, `rgba(100, 30, 5, 0)`);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(sx, sy, fireRadius, 0, Math.PI * 2);
          ctx.fill();

          // Smoke ring (expands outward)
          ctx.strokeStyle = `rgba(80, 80, 80, ${alpha * 0.3})`;
          ctx.lineWidth = 5 * expandPct;
          ctx.beginPath();
          ctx.arc(sx, sy, e.radius * expandPct, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }

        case 'heal': {
          const expandPct = 1 - pct;
          // Green ring expanding outward
          ctx.strokeStyle = `rgba(80, 255, 120, ${alpha * 0.5})`;
          ctx.lineWidth = 3 * pct;
          ctx.beginPath();
          ctx.arc(sx, sy, e.radius * (0.3 + expandPct * 0.7), 0, Math.PI * 2);
          ctx.stroke();

          // Green glow fill
          ctx.fillStyle = `rgba(80, 255, 120, ${alpha * 0.12})`;
          ctx.beginPath();
          ctx.arc(sx, sy, e.radius * (0.5 + expandPct * 0.5), 0, Math.PI * 2);
          ctx.fill();

          // Rising plus signs
          ctx.fillStyle = `rgba(80, 255, 120, ${alpha * 0.7})`;
          ctx.font = `bold ${10 + expandPct * 4}px Courier New`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('+', sx, sy - expandPct * 20);
          ctx.fillText('+', sx - 15, sy - expandPct * 12);
          ctx.fillText('+', sx + 15, sy - expandPct * 14);
          break;
        }

        case 'melee': {
          const swingPct = pct;
          const swingAngle = e.angle + (1 - swingPct) * 3.5 - 1.75;
          // Outer arc
          ctx.strokeStyle = `rgba(255, 255, 200, ${alpha * 0.9})`;
          ctx.lineWidth = 5 * pct;
          ctx.beginPath();
          ctx.arc(sx, sy, 28, swingAngle - 1.0, swingAngle + 1.0);
          ctx.stroke();
          // Inner bright slash
          ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.6})`;
          ctx.lineWidth = 2 * pct;
          ctx.beginPath();
          ctx.arc(sx, sy, 22, swingAngle - 0.8, swingAngle + 0.8);
          ctx.stroke();
          break;
        }
      }
    }
  }
}
