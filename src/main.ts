import Phaser from 'phaser';
import './style.css';
import { sound } from './audio/RetroSound';
import { PreloadScene } from './scenes/PreloadScene';
import { ExploreScene } from './scenes/ExploreScene';
import { gameState } from './state/gameState';

let gameInstance: Phaser.Game | null = null;

function bootPhaserGame(): void {
  if (gameInstance) return;
  gameInstance = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'phaser-mount',
    width: 1280,
    height: 720,
    backgroundColor: '#0b1120',
    pixelArt: true,
    roundPixels: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { x: 0, y: 0 },
        debug: false
      }
    },
    scene: [PreloadScene, ExploreScene]
  });
}

const clsButtons = document.querySelectorAll<HTMLButtonElement>('#class-selector .cls-btn');
clsButtons.forEach((btn) => {
  btn.addEventListener('pointerdown', () => {
    clsButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    gameState.studentClass = btn.dataset.cls || '4A';
    sound.pop();
  });
});

document.getElementById('btn-start-adventure')!.addEventListener('click', () => {
  const nameInput = document.getElementById('input-student-name') as HTMLInputElement;
  gameState.studentName = nameInput.value.trim() || '陳小明';
  document.getElementById('hud-player-pill')!.textContent = `👦 ${gameState.studentClass} ${gameState.studentName}`;
  document.getElementById('title-overlay')!.classList.add('hidden');
  sound.success();
  bootPhaserGame();
});

document.getElementById('btn-checklist-toggle')!.addEventListener('click', () => {
  document.getElementById('quest-panel')!.classList.toggle('open');
  sound.pop();
});

document.getElementById('btn-audio-toggle')!.addEventListener('click', (e) => {
  sound.muted = !sound.muted;
  (e.currentTarget as HTMLButtonElement).textContent = sound.muted ? '🔇 靜音' : '🔊 音效';
});

document.getElementById('btn-play-again')!.addEventListener('click', () => {
  gameState.reset();
  document.getElementById('cert-overlay')!.classList.add('hidden');
  window.dispatchEvent(new CustomEvent('cwsj-restart-game'));
});
