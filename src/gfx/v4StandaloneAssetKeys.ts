/**
 * Standalone foreground prop keys & coordinates for Home (26 items) and HK Street (10 complete pure-transparent items)
 */
export const HOME_STANDALONE_PROP_KEYS = [
  'double_bed',
  'bathtub',
  'sofa_2seat',
  'green_rug',
  'shower',
  'kitchen_bottom',
  'cake_table',
  'dining_table',
  'computer_desk',
  'tv_cabinet',
  'plant_large',
  'sink_vanity',
  'armchair_left',
  'armchair_right',
  'kitchen_top',
  'front_door',
  'balcony_railing',
  'plant_whitepot',
  'toilet',
  'toy_box',
  'plant_small',
  'chair_side',
  'chair_front',
  'mirror',
  'nightstand',
  'towel'
] as const;

export type HomeStandalonePropKey = (typeof HOME_STANDALONE_PROP_KEYS)[number];

export interface StreetPropPlacement {
  key: string;
  /** Left X in 1408x768 HK street reference space */
  x: number;
  /** Top Y in 1408x768 HK street reference space */
  y: number;
  /** Width in 1408x768 HK street reference space */
  w: number;
  /** Height in 1408x768 HK street reference space */
  h: number;
  layer: 'ground' | 'ysort' | 'sign';
}

export const STREET_STANDALONE_PROP_SPECS: readonly StreetPropPlacement[] = [
  { key: 'canal_bridge', x: 1145, y: 286, w: 169, h: 129, layer: 'ground' },
  { key: 'footbridge', x: 580, y: 140, w: 251, h: 151, layer: 'ground' },
  { key: 'park_tree', x: 118, y: 158, w: 80, h: 106, layer: 'ysort' },
  { key: 'park_slide', x: 264, y: 183, w: 93, h: 83, layer: 'ysort' },
  { key: 'park_swing', x: 393, y: 168, w: 98, h: 64, layer: 'ysort' },
  { key: 'recycle_bins', x: 237, y: 296, w: 114, h: 40, layer: 'ysort' },
  { key: 'traffic_light', x: 556, y: 296, w: 17, h: 54, layer: 'ysort' },
  { key: 'chachaanteng', x: 826, y: 164, w: 228, h: 150, layer: 'ysort' },
  { key: 'daipaidong', x: 780, y: 440, w: 271, h: 194, layer: 'ysort' },
  { key: 'outdoor_dining_table', x: 1002, y: 610, w: 89, h: 94, layer: 'ysort' }
];
