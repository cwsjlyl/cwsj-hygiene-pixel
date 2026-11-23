import Phaser from 'phaser';
import './style.css';
import { sound } from './audio/RetroSound';
import { installCrispChineseTextPatch } from './gfx/CrispVisuals';
import { ExploreScene } from './scenes/ExploreScene';
import { MinigameScene } from './scenes/MinigameScene';
import { PreloadScene } from './scenes/PreloadScene';
import { gameState } from './state/gameState';

installCrispChineseTextPatch();

let gameInstance: Phaser.Game | null = null;

function bootPhaserGame(): void {
  if (gameInstance) return;
  gameInstance = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'phaser-mount',
    width: 1280,
    height: 720,
    backgroundColor: '#0b1120',
    // 關閉全局強制 pixelArt，避免中文字體被 NEAREST 濾鏡切碎；像素貼圖於 PreloadScene 獨立設定濾鏡
    pixelArt: false,
    antialias: true,
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
    scene: [PreloadScene, ExploreScene, MinigameScene]
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
  sound.playBgm('home');
  bootPhaserGame();
});

document.getElementById('btn-checklist-toggle')!.addEventListener('click', () => {
  document.getElementById('quest-panel')!.classList.toggle('open');
  sound.pop();
});

document.getElementById('btn-bgm-toggle')!.addEventListener('click', (e) => {
  const playing = sound.toggleBgm();
  (e.currentTarget as HTMLButtonElement).textContent = playing ? '🎵 音樂' : '🔕 音樂關';
});

document.getElementById('btn-audio-toggle')!.addEventListener('click', (e) => {
  sound.sfxMuted = !sound.sfxMuted;
  (e.currentTarget as HTMLButtonElement).textContent = sound.sfxMuted ? '🔇 靜音' : '🔊 音效';
});

document.getElementById('btn-play-again')!.addEventListener('click', () => {
  gameState.reset();
  document.getElementById('cert-overlay')!.classList.add('hidden');
  sound.playBgm('home');
  window.dispatchEvent(new CustomEvent('cwsj-restart-game'));
});
