import { useEffect, useRef } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { clampCrop, cropRect, panCrop, type CropState } from './crop';
import type { DecodedImage } from './imageOps';

const PREVIEW_PX = 480;

interface Props {
  image: DecodedImage;
  crop: CropState;
  onCropChange: (c: CropState) => void;
  /** When set, shown instead of the crop (e.g. a background-removed cutout). */
  overlay?: HTMLCanvasElement | null;
  disabled?: boolean;
  label: string;
}

export function CropPreview({ image, crop, onCropChange, overlay, disabled, label }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, PREVIEW_PX, PREVIEW_PX);
    ctx.imageSmoothingQuality = 'high';
    if (overlay) {
      ctx.drawImage(overlay, 0, 0, PREVIEW_PX, PREVIEW_PX);
    } else {
      const { sx, sy, size } = cropRect(crop, image.width, image.height);
      ctx.drawImage(image.bitmap, sx, sy, size, size, 0, 0, PREVIEW_PX, PREVIEW_PX);
    }
  }, [image, crop, overlay]);

  const editable = !disabled && !overlay;

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!editable) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!drag.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    drag.current = { x: e.clientX, y: e.clientY };
    onCropChange(panCrop(crop, dx, dy, rect.width, image.width, image.height));
  };
  const endDrag = () => {
    drag.current = null;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLCanvasElement>) => {
    if (!editable) return;
    const step = 24;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const m = moves[e.key];
    if (m) {
      e.preventDefault();
      onCropChange(panCrop(crop, m[0], m[1], PREVIEW_PX, image.width, image.height));
    } else if (e.key === '+' || e.key === '=') {
      onCropChange(clampCrop({ ...crop, zoom: crop.zoom + 0.2 }, image.width, image.height));
    } else if (e.key === '-') {
      onCropChange(clampCrop({ ...crop, zoom: crop.zoom - 0.2 }, image.width, image.height));
    }
  };

  return (
    <div className="crop">
      <canvas
        ref={canvasRef}
        width={PREVIEW_PX}
        height={PREVIEW_PX}
        className={`crop__canvas ${editable ? 'crop__canvas--editable' : ''}`}
        tabIndex={editable ? 0 : -1}
        role="img"
        aria-label={
          editable ? `${label}. Drag or use arrow keys to move, plus and minus to zoom.` : label
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
