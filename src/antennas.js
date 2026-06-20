// antennas.js — Ubiquiti antenna catalog (gain dBi from official datasheets) + helpers.
// Selecting a model sets that end's antenna gain in the link budget. Image URLs point at
// Ubiquiti's CDN; the UI falls back to a per-type SVG icon if an image fails to load.
export const ANTENNAS = [
  {
    "id": "litebeam-5ac-gen2",
    "name": "airMAX LiteBeam 5AC Gen2",
    "line": "airMAX",
    "band": "5 GHz",
    "type": "cpe",
    "gainDbi": 23,
    "beamwidthDeg": 10,
    "imageUrl": "https://images.svc.ui.com/?u=https%3A%2F%2Fcdn.ecomm.ui.com%2Fproducts%2F5987bfd2-8c3c-4191-9f09-71654bb89925%2Fff6051a4-c709-4f61-9bcb-49dda2944b0e.png&q=75&w=1024",
    "productUrl": "https://store.ui.com/us/en/products/litebeam-5ac"
  },
  {
    "id": "litebeam-5ac-lr",
    "name": "airMAX LiteBeam 5AC LR (Long-Range)",
    "line": "airMAX",
    "band": "5 GHz",
    "type": "cpe",
    "gainDbi": 26,
    "beamwidthDeg": 7,
    "imageUrl": "https://images.svc.ui.com/?u=https%3A%2F%2Fcdn.ecomm.ui.com%2Fproducts%2F616ed381-aba0-4b72-b366-d029cb83e296%2F6a911b7e-49ea-4daf-9214-211581c2e172.png&q=75&w=1024",
    "productUrl": "https://store.ui.com/us/en/products/lbe-5ac-lr"
  },
  {
    "id": "nanobeam-5ac-gen2",
    "name": "airMAX NanoBeam 5AC Gen2 (NBE-5AC-19)",
    "line": "airMAX",
    "band": "5 GHz",
    "type": "cpe",
    "gainDbi": 19,
    "beamwidthDeg": 15,
    "imageUrl": "https://images.svc.ui.com/?u=https%3A%2F%2Fcdn.ecomm.ui.com%2Fproducts%2F75529694-2bf4-483a-878f-71ccf550dc54%2F040ece11-6179-4b19-8a65-7869a53b2ab2.png&q=75&w=1024",
    "productUrl": "https://store.ui.com/us/en/products/nanobeam-5ac"
  },
  {
    "id": "powerbeam-5ac-300",
    "name": "airMAX PowerBeam 5AC 300",
    "line": "airMAX",
    "band": "5 GHz",
    "type": "dish",
    "gainDbi": 22,
    "beamwidthDeg": 9,
    "imageUrl": null,
    "productUrl": "https://dl.ubnt.com/datasheets/PowerBeam_ac/PowerBeam5ac_DS.pdf"
  },
  {
    "id": "powerbeam-5ac-400",
    "name": "airMAX PowerBeam 5AC 400",
    "line": "airMAX",
    "band": "5 GHz",
    "type": "dish",
    "gainDbi": 25,
    "beamwidthDeg": 7,
    "imageUrl": null,
    "productUrl": "https://dl.ubnt.com/datasheets/PowerBeam_ac/PowerBeam5ac_DS.pdf"
  },
  {
    "id": "powerbeam-5ac-500",
    "name": "airMAX PowerBeam 5AC 500",
    "line": "airMAX",
    "band": "5 GHz",
    "type": "dish",
    "gainDbi": 27,
    "beamwidthDeg": 5,
    "imageUrl": "https://images.svc.ui.com/?u=https%3A%2F%2Fcdn.ecomm.ui.com%2Fproducts%2F9b079a4c-47c4-43d9-ac69-9b30c6913a2b%2Fb1091cd7-12d2-4690-95dd-da9f4479432e.png&q=75&w=1024",
    "productUrl": "https://store.ui.com/us/en/products/pbe-5ac-500"
  },
  {
    "id": "powerbeam-5ac-620",
    "name": "airMAX PowerBeam 5AC 620",
    "line": "airMAX",
    "band": "5 GHz",
    "type": "dish",
    "gainDbi": 29,
    "beamwidthDeg": 4,
    "imageUrl": "https://images.svc.ui.com/?u=https%3A%2F%2Fcdn.ecomm.ui.com%2Fproducts%2Fe72e9b40-09ef-4596-94d0-e9723af7c805%2Fa02d0e3d-a022-4a30-95e8-585a06c99ef5.png&q=75&w=1024",
    "productUrl": "https://store.ui.com/us/en/products/pbe-5ac-620"
  },
  {
    "id": "powerbeam-5ac-iso-gen2",
    "name": "airMAX PowerBeam 5AC ISO Gen2",
    "line": "airMAX",
    "band": "5 GHz",
    "type": "dish",
    "gainDbi": 25,
    "beamwidthDeg": 7,
    "imageUrl": "https://images.svc.ui.com/?u=https%3A%2F%2Fcdn.ecomm.ui.com%2Fproducts%2F1bfac2bc-8d86-49d9-bd8f-dafe3ca74aad%2Fd58ae1e8-99b4-4d6d-9f14-cf78c3b7c711.png&q=75&w=1024",
    "productUrl": "https://store.ui.com/us/en/products/pbe-5ac-iso"
  },
  {
    "id": "nanostation-5ac",
    "name": "airMAX NanoStation 5AC",
    "line": "airMAX",
    "band": "5 GHz",
    "type": "cpe",
    "gainDbi": 16,
    "beamwidthDeg": 45,
    "imageUrl": "https://images.svc.ui.com/?u=https%3A%2F%2Fcdn.ecomm.ui.com%2Fproducts%2Fd18cee2b-057f-4a99-ac56-8b64d42a3166%2F28be74cc-9c25-4cec-a3be-44b0cd3baa30.png&q=75&w=1024",
    "productUrl": "https://store.ui.com/us/en/products/ns-5ac"
  },
  {
    "id": "nanostation-5ac-loco",
    "name": "airMAX NanoStation 5AC LOCO",
    "line": "airMAX",
    "band": "5 GHz",
    "type": "cpe",
    "gainDbi": 13,
    "beamwidthDeg": 45,
    "imageUrl": "https://images.svc.ui.com/?u=https%3A%2F%2Fcdn.ecomm.ui.com%2Fproducts%2F3525fe19-1b9a-42bb-8db8-62057aedd6db%2F4d76998a-b7e8-4d81-8448-f32d5560a683.png&q=75&w=1024",
    "productUrl": "https://store.ui.com/us/en/products/loco5ac"
  },
  {
    "id": "rocket-5ac-prism",
    "name": "airMAX Rocket 5AC Prism (AM-5AC22-45 sector)",
    "line": "airMAX",
    "band": "5 GHz",
    "type": "sector",
    "gainDbi": 22,
    "beamwidthDeg": 45,
    "imageUrl": "https://images.svc.ui.com/?u=https%3A%2F%2Fcdn.ecomm.ui.com%2Fproducts%2Ff0063e4c-e231-407b-872a-2f5e2162dc4a%2F32ce77f8-d3ff-45f1-b304-c29e8aa0cb0e.png&q=75&w=1024",
    "productUrl": "https://store.ui.com/us/en/products/rocket-5ac-prism",
    "note": "Radio sold without antenna; gain shown is for the paired AM-5AC22-45 22 dBi airMAX ac sector. Pairs with AM-5G17-90 (17 dBi) or AM-5G20-90 (20 dBi) as well."
  },
  {
    "id": "am-5g17-90",
    "name": "airMAX Sector AM-5G17-90",
    "line": "airMAX",
    "band": "5 GHz",
    "type": "sector",
    "gainDbi": 17,
    "beamwidthDeg": 90,
    "imageUrl": "https://images.svc.ui.com/?u=https%3A%2F%2Fcdn.ecomm.ui.com%2Fproducts%2Fb04cbb5f-0f7f-46f0-ab8b-b425986054a1%2F74c85ec3-c7a9-4162-b6f9-ed901549ab5c.png&q=75&w=1024",
    "productUrl": "https://store.ui.com/us/en/products/am-5g1"
  },
  {
    "id": "am-5g20-90",
    "name": "airMAX Sector AM-5G20-90",
    "line": "airMAX",
    "band": "5 GHz",
    "type": "sector",
    "gainDbi": 20,
    "beamwidthDeg": 90,
    "imageUrl": "https://images.svc.ui.com/?u=https%3A%2F%2Fcdn.ecomm.ui.com%2Fproducts%2F6b8b5d2e-009d-4229-a0b9-e1bc08110029%2Fa23fa112-9134-455e-ab3d-6cf98b80f78f.png&q=75&w=1024",
    "productUrl": "https://eu.store.ui.com/eu/en/products/am-5g2"
  },
  {
    "id": "am-5ac22-45",
    "name": "airMAX ac Sector AM-5AC22-45",
    "line": "airMAX",
    "band": "5 GHz",
    "type": "sector",
    "gainDbi": 22,
    "beamwidthDeg": 45,
    "imageUrl": "https://images.svc.ui.com/?u=https%3A%2F%2Fcdn.ecomm.ui.com%2Fproducts%2F097a2fdf-c171-4ba6-a20b-ba35d614e564%2F6426be0c-b8e6-42f7-b7bb-ece42df5439f.png&q=75&w=1024",
    "productUrl": "https://store.ui.com/us/en/products/am-5ac22-45"
  },
  {
    "id": "amo-5g10",
    "name": "airMAX Omni AMO-5G10",
    "line": "airMAX",
    "band": "5 GHz",
    "type": "omni",
    "gainDbi": 10,
    "beamwidthDeg": 360,
    "imageUrl": "https://images.svc.ui.com/?u=https%3A%2F%2Fcdn.ecomm.ui.com%2Fproducts%2Fa175eb6f-cd40-4e1d-9d44-2bc6b6f17a40%2F3b8f53d3-4105-49e4-b4b9-d67c1d604332.png&q=75&w=1024",
    "productUrl": "https://store.ui.com/us/en/products/amo-5g10"
  },
  {
    "id": "amo-5g13",
    "name": "airMAX Omni AMO-5G13",
    "line": "airMAX",
    "band": "5 GHz",
    "type": "omni",
    "gainDbi": 13,
    "beamwidthDeg": 360,
    "imageUrl": "https://images.svc.ui.com/?u=https%3A%2F%2Fcdn.ecomm.ui.com%2Fproducts%2F8d8001b6-b717-4d61-a7dd-529d464587eb%2Fb23c00a4-a34c-4bab-b482-8bb5d2cb8340.png&q=75&w=1024",
    "productUrl": "https://store.ui.com/us/en/products/amo-5g13"
  },
  {
    "id": "nanostation-m2",
    "name": "airMAX NanoStation M2",
    "line": "airMAX",
    "band": "2.4 GHz",
    "type": "cpe",
    "gainDbi": 11,
    "beamwidthDeg": 60,
    "imageUrl": "https://images.svc.ui.com/?u=https%3A%2F%2Fcdn.ecomm.ui.com%2Fproducts%2F2c14d4cd-376d-46e9-92ce-d5f3a130c54a%2F9bd828a1-45bf-4982-aee2-98c6f2b611c2.png&q=75&w=1024",
    "productUrl": "https://store.ui.com/us/en/products/nsm2"
  },
  {
    "id": "nanobeam-m2-13",
    "name": "airMAX NanoBeam M2-13",
    "line": "airMAX",
    "band": "2.4 GHz",
    "type": "cpe",
    "gainDbi": 13,
    "beamwidthDeg": 27,
    "imageUrl": null,
    "productUrl": "https://dl.ubnt.com/guides/nanobeam/NBE-M2-13_QSG.pdf"
  },
  {
    "id": "rocket-m2",
    "name": "airMAX Rocket M2 (AM-2G16-90 sector)",
    "line": "airMAX",
    "band": "2.4 GHz",
    "type": "sector",
    "gainDbi": 16,
    "beamwidthDeg": 90,
    "imageUrl": "https://images.svc.ui.com/?u=https%3A%2F%2Fcdn.ecomm.ui.com%2Fproducts%2F7d5f6b23-f3a0-41c4-9d3e-d378e05057e9%2Fc96f53e9-1264-462f-b3bd-5631c521e0bd.png&q=75&w=1024",
    "productUrl": "https://store.ui.com/us/en/products/am-2g16-90",
    "note": "Radio sold without antenna; gain shown is for the paired AM-2G16-90 16 dBi 2.4 GHz sector. Image is of the AM-2G16-90 sector antenna."
  },
  {
    "id": "am-2g16-90",
    "name": "airMAX Sector AM-2G16-90",
    "line": "airMAX",
    "band": "2.4 GHz",
    "type": "sector",
    "gainDbi": 16,
    "beamwidthDeg": 90,
    "imageUrl": "https://images.svc.ui.com/?u=https%3A%2F%2Fcdn.ecomm.ui.com%2Fproducts%2F7d5f6b23-f3a0-41c4-9d3e-d378e05057e9%2Fc96f53e9-1264-462f-b3bd-5631c521e0bd.png&q=75&w=1024",
    "productUrl": "https://store.ui.com/us/en/products/am-2g16-90"
  },
  {
    "id": "ltu-lr",
    "name": "LTU-LR (LTU Long-Range)",
    "line": "LTU",
    "band": "5 GHz",
    "type": "cpe",
    "gainDbi": 26,
    "beamwidthDeg": 7,
    "imageUrl": "https://images.svc.ui.com/?u=https%3A%2F%2Fcdn.ecomm.ui.com%2Fproducts%2F289d8757-8b18-4333-9a1e-798cefd6f3c3%2Fc5fffc7e-4360-480a-a21c-caae7db1f2a2.png&q=75&w=1024",
    "productUrl": "https://store.ui.com/us/en/products/ltu-lr"
  },
  {
    "id": "ltu-pro",
    "name": "LTU-Pro",
    "line": "LTU",
    "band": "5 GHz",
    "type": "cpe",
    "gainDbi": 24,
    "beamwidthDeg": 14,
    "imageUrl": "https://images.svc.ui.com/?u=https%3A%2F%2Fcdn.ecomm.ui.com%2Fproducts%2F34b576b7-3e5e-49a4-8b56-e5f13f9952d5%2Ff6a005a5-7bed-4903-9841-efb1915e1ce8.png&q=75&w=1024",
    "productUrl": "https://store.ui.com/us/en/products/ltu-pro"
  },
  {
    "id": "ltu-lite",
    "name": "LTU-LITE",
    "line": "LTU",
    "band": "5 GHz",
    "type": "cpe",
    "gainDbi": 13,
    "beamwidthDeg": 45,
    "imageUrl": "https://images.svc.ui.com/?u=https%3A%2F%2Fcdn.ecomm.ui.com%2Fproducts%2F5d019c8b-579a-4a90-b260-9d5b825c31d2%2Fe18b107b-c765-4ca9-846c-4a74a07f0010.png&q=75&w=1024",
    "productUrl": "https://store.ui.com/us/en/products/ltu-lite-us"
  },
  {
    "id": "ltu-rocket",
    "name": "LTU Rocket (BaseStation radio)",
    "line": "LTU",
    "band": "5 GHz",
    "type": "sector",
    "gainDbi": 22,
    "beamwidthDeg": 45,
    "imageUrl": "https://images.svc.ui.com/?u=https%3A%2F%2Fcdn.ecomm.ui.com%2Fproducts%2F03c17d44-ee95-43db-9bfb-b53c24605f48%2F2cb66441-315e-4521-8767-d5505ccf1b70.png&q=75&w=1024",
    "productUrl": "https://store.ui.com/us/en/products/ltu-rocket",
    "note": "BaseStation radio sold without antenna; gain shown is for a typical paired AM-5AC22-45 22 dBi airMAX ac sector. Use the gain of whatever sector antenna is attached."
  },
  {
    "id": "airfiber-5xhd",
    "name": "airFiber 5XHD (AF-5G30-S45 dish)",
    "line": "airFiber",
    "band": "5 GHz",
    "type": "dish",
    "gainDbi": 30,
    "beamwidthDeg": 5,
    "imageUrl": "https://images.svc.ui.com/?u=https%3A%2F%2Fcdn.ecomm.ui.com%2Fproducts%2Ff120c3aa-3c01-4670-82dc-2e63357b7615%2Fe748cb34-0591-44fb-ac98-d11a28c6dd7b.png&q=75&w=1024",
    "productUrl": "https://store.ui.com/us/en/products/airfiber-5xhd-1",
    "note": "Radio sold without antenna; gain shown is for the paired AF-5G30-S45 30 dBi dish. Also pairs with AF-5G23-S45 (23 dBi) or AF-5G34-S45 (34 dBi)."
  },
  {
    "id": "af-5g23-s45",
    "name": "airFiber X AF-5G23-S45 Dish",
    "line": "airFiber",
    "band": "5 GHz",
    "type": "dish",
    "gainDbi": 23,
    "beamwidthDeg": 12,
    "imageUrl": "https://images.svc.ui.com/?u=https%3A%2F%2Fcdn.ecomm.ui.com%2Fproducts%2F1747582c-87a4-4aa0-911f-e6bdc6122a29%2F4ba69f80-fdb9-4a06-be55-47c1383c1bc0.png&q=75&w=1024",
    "productUrl": "https://store.ui.com/us/en/collections/uisp-wireless-antennas-dish/products/af-5g23-s45"
  },
  {
    "id": "af-5g30-s45",
    "name": "airFiber X AF-5G30-S45 Dish",
    "line": "airFiber",
    "band": "5 GHz",
    "type": "dish",
    "gainDbi": 30,
    "beamwidthDeg": 5,
    "imageUrl": "https://images.svc.ui.com/?u=https%3A%2F%2Fcdn.ecomm.ui.com%2Fproducts%2Fbd78c8f3-6fd5-4bcc-89a5-b11a23d62929%2Fc57d3ae8-3119-4a57-8b54-fa09bbaa1fd0.png&q=75&w=1024",
    "productUrl": "https://store.ui.com/us/en/products/airfiber-x-antenna-5ghz-30dbi-slant-45"
  },
  {
    "id": "af-5g34-s45",
    "name": "airFiber X AF-5G34-S45 Dish",
    "line": "airFiber",
    "band": "5 GHz",
    "type": "dish",
    "gainDbi": 34,
    "beamwidthDeg": 4,
    "imageUrl": "https://images.svc.ui.com/?u=https%3A%2F%2Fcdn.ecomm.ui.com%2Fproducts%2F8150e2c3-1e86-4969-ba8c-ac0e552b6f96%2F6b9acca6-91fc-4dcd-aefd-494d514e4b7f.png&q=75&w=1024",
    "productUrl": "https://store.ui.com/us/en/collections/uisp-wireless-antennas-dish/products/af-5g34-s45"
  },
  {
    "id": "airfiber-24",
    "name": "airFiber 24 (AF-24)",
    "line": "airFiber",
    "band": "24 GHz",
    "type": "dish",
    "gainDbi": 33,
    "beamwidthDeg": 3.5,
    "imageUrl": "https://images.svc.ui.com/?u=https%3A%2F%2Fcdn.ecomm.ui.com%2Fproducts%2F3066644f-016c-4920-9aa0-d5888359a9bd%2F18934faf-56d7-4bb1-9191-ed8884f73521.png&q=75&w=1024",
    "productUrl": "https://store.ui.com/us/en/products/af-24",
    "note": "Integrated dual-dish radio; 33 dBi is the integrated antenna gain from the airFiber datasheet."
  },
  {
    "id": "af60-lr",
    "name": "airFiber 60 LR (AF60-LR)",
    "line": "airFiber",
    "band": "60 GHz",
    "type": "dish",
    "gainDbi": 38,
    "beamwidthDeg": 2,
    "imageUrl": "https://images.svc.ui.com/?u=https%3A%2F%2Fcdn.ecomm.ui.com%2Fproducts%2Fa699990e-21a7-4241-8e83-adf5a0ce9d53%2Fe3b97b38-ade9-4121-95b4-8e3909a43ac6.png&q=75&w=1024",
    "productUrl": "https://store.ui.com/us/en/category/60ghz-wireless-airfiber/products/af-60-lr",
    "note": "Integrated dish radio; 38 dBi antenna gain at 60 GHz per datasheet."
  }
];

const BY_ID = Object.fromEntries(ANTENNAS.map((a) => [a.id, a]));
export function antennaById(id) { return id ? (BY_ID[id] || null) : null; }

export const TYPE_LABEL = { dish: 'צלחת', sector: 'סקטור', omni: 'אומני', cpe: 'CPE', horn: 'הורן' };

const ICONS = {
  dish: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><ellipse cx="11" cy="11" rx="8" ry="4.6" transform="rotate(-32 11 11)"/><path d="M11 11l7 7"/><circle cx="18.5" cy="18.5" r="1.5" fill="currentColor"/></svg>',
  sector: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 21V7"/><path d="M5 12a9 9 0 0 1 14 0"/><path d="M8 14.5a5 5 0 0 1 8 0"/></svg>',
  omni: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 21V4"/><path d="M8.5 8a6 6 0 0 1 7 0"/><path d="M6 5.5a10 10 0 0 1 12 0"/></svg>',
  cpe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="5" y="4" width="14" height="11" rx="2"/><path d="M12 15v5M8.5 20h7"/></svg>',
  horn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 9l8-3v12l-8-3z"/><path d="M12 8h6"/></svg>',
};
export function typeIconSvg(type) { return ICONS[type] || ICONS.cpe; }
