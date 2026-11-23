export const HOME_STANDALONE_PROP_KEYS = [
  'double_bed',
  'tv_cabinet',
  'door',
  'shower',
  'sofa_2seat',
  'chair_front',
  'cake_table',
  'green_rug',
  'plant_large',
  'dining_table',
  'armchair_left',
  'armchair_right',
  'sink_vanity',
  'computer_desk',
  'toilet',
  'nightstand',
  'chair_side',
  'bathtub',
  'plant_whitepot',
  'toy_box',
  'plant_small',
  'kitchen_top',
  'kitchen_bottom',
  'balcony_railing',
  'mirror',
  'towel'
] as const;

export type HomeStandalonePropKey = (typeof HOME_STANDALONE_PROP_KEYS)[number];

export interface StreetPropPlacement {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  layer: 'ground' | 'ysort' | 'sign';
}

export const STREET_STANDALONE_PROP_SPECS: readonly StreetPropPlacement[] = [
  { key: 'canal_bridge', x: 1134, y: 336, w: 192, h: 30, layer: 'ground' },
  { key: 'footbridge_deck', x: 581, y: 146, w: 249, h: 140, layer: 'ground' },
  { key: 'park_slide', x: 264, y: 182, w: 93, h: 85, layer: 'ysort' },
  { key: 'park_swing', x: 392, y: 166, w: 100, h: 69, layer: 'ysort' },
  { key: 'recycle_bins', x: 235, y: 294, w: 118, h: 44, layer: 'ysort' },
  { key: 'street_railing_l', x: 437, y: 327, w: 110, h: 28, layer: 'ysort' },
  { key: 'street_railing_r', x: 861, y: 327, w: 111, h: 28, layer: 'ysort' },
  { key: 'cafe_menu_board', x: 888, y: 274, w: 28, h: 40, layer: 'ysort' },
  { key: 'cafe_table_set', x: 982, y: 268, w: 68, h: 41, layer: 'ysort' },
  { key: 'outdoor_dining_table', x: 1009, y: 610, w: 75, h: 94, layer: 'ysort' },
  { key: 'chachaanteng_sign', x: 867, y: 167, w: 186, h: 56, layer: 'sign' },
  { key: 'daipaidong_sign', x: 824, y: 444, w: 186, h: 58, layer: 'sign' }
];
