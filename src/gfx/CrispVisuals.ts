import Phaser from 'phaser';

export function installCrispChineseTextPatch(): void {
  const proto = Phaser.GameObjects.Text.prototype as unknown as {
    updateText: () => Phaser.GameObjects.Text;
    __cwsjPatched?: boolean;
  };
  if (proto.__cwsjPatched) return;
  proto.__cwsjPatched = true;

  const origUpdate = proto.updateText;
  proto.updateText = function patchedText(this: Phaser.GameObjects.Text) {
    if ((this.style?.resolution ?? 1) < 3) {
      this.style.resolution = 3;
    }
    const res = origUpdate.call(this);
    if (this.frame?.source) {
      this.frame.source.scaleMode = Phaser.ScaleModes.LINEAR;
    }
    return res;
  };
}
