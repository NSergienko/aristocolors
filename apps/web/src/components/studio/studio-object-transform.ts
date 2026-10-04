import { FabricImage, Rect } from 'fabric';

export type LayerCrop = { top: number; bottom: number; left: number; right: number };
export type EditableImage = FabricImage & { studioCrop?: LayerCrop };
export const emptyCrop = (): LayerCrop => ({ top: 0, bottom: 0, left: 0, right: 0 });

export function applyLayerCrop(object: EditableImage, crop: LayerCrop) {
  object.studioCrop = { ...crop };
  object.set('clipPath', Object.values(crop).some(value => value > 0) ? new Rect({
    originX: 'center', originY: 'center',
    left: object.width * (crop.left - crop.right) / 200,
    top: object.height * (crop.top - crop.bottom) / 200,
    width: object.width * Math.max(0, 100 - crop.left - crop.right) / 100,
    height: object.height * Math.max(0, 100 - crop.top - crop.bottom) / 100,
    fill: '#000', strokeWidth: 0,
  }) : undefined);
  object.set('dirty', true);
}
