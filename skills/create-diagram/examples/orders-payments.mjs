// Two apps, Orders and Payments, each with its Dapr sidecar. The Orders sidecar
// saves state to a Redis state store and publishes to a Kafka pub/sub broker;
// the broker delivers to the Payments sidecar.
//
// Two apps, so they take APP[0] (green) and APP[1] (light blue), and the broker
// stays the house green. Payments sits on the right with `mirror: true`, so both
// sidecars face the broker between them and the line on the sidecars' height
// runs straight from one to the other through the pipe. Every x is derived
// from the canvas centre, so the drawing is centred by construction.
//
// Balance: only Orders uses state, so Redis is a branch on one side. Straight
// under the Orders sidecar it left the bottom-right quarter empty, so it sits
// under the pipe on an elbow instead: all four quarters carry a shape.
import { C, APP } from '../_engine/engine.mjs';
import { arrow, cylinder, elbowArrow, group, hexHalfWidth, label, pipe, STORE_RATIO } from '../_engine/shapes.mjs';
import { appSidecar, sidecarAt, SIDECAR_R } from '../_engine/app.mjs';
import { icon } from '../_engine/icons.mjs';

const TEXT = 13; // the labels on the runs
const NAME = 15; // every shape's name, so the four names match
const MARK = 40; // both marks, fitted to their ink so they weigh the same
const WORD_DY = 14; // a label rides this far above its run
const NAME_DY = 18; // a name sits this far below its shape
const EDGE = 20; // the band of air on the tight axis

const APP_R = 54;

// The broker, centred on the canvas. 150 long and 60 across: 2.5 diameters,
// inside pipe()'s 2 to 3.
const PIPE_RX = 12;
const PIPE_RY = 30;
const PIPE_LEN = 150;
const PIPE_REACH = PIPE_LEN / 2 + PIPE_RX; // centre to the drawn end cap

const LEG = 100; // sidecar to pipe cap: "Subscribe" (64 at 13) plus two characters each side

// Horizontal extent, from the centre out: pipe, leg, sidecar, then the app
// hexagon's far side. The sidecar's near edge sits on the app's centre.
const R_S = APP_R * SIDECAR_R;
const SIDE_DX = PIPE_REACH + LEG + hexHalfWidth(R_S); // canvas centre to a sidecar centre
const APP_DX = SIDE_DX + hexHalfWidth(R_S); // canvas centre to an app centre
const HALF_W = APP_DX + hexHalfWidth(APP_R);

// The store sits under the pipe, centred on the canvas. 110 wide, so 91.7 tall.
const STORE_W = 110;
const STORE_H = STORE_W / STORE_RATIO;
const GAP = 28; // the pipe's name to the store's top: about two characters
const ELBOW_R = 10; // the house radius for a small elbow

// Vertical extent, from the app's top to the store's name.
const APP_Y = EDGE + APP_R;
const probe = sidecarAt({ x: 0, y: APP_Y, r: APP_R, size: NAME });
const SIDE_Y = probe.y;
const PIPE_NAME_Y = SIDE_Y + PIPE_RY + NAME_DY;
const STORE_Y = PIPE_NAME_Y + NAME / 2 + GAP + STORE_H / 2;
const STORE_NAME_Y = STORE_Y + STORE_H / 2 + NAME_DY;
const BOTTOM = STORE_NAME_Y + NAME / 2;

// Canvas: the tight axis is height, with EDGE above and below; width takes the
// rest, at least 16:9.
const H = Math.ceil(BOTTOM + EDGE);
const W = Math.ceil(Math.max(2 * HALF_W + 2 * EDGE, H * 16 / 9));
const CX = W / 2;

const ORDERS = { x: CX - APP_DX, y: APP_Y, r: APP_R, label: 'Orders', size: NAME, ...APP[0] };
const PAYMENTS = { x: CX + APP_DX, y: APP_Y, r: APP_R, label: 'Payments', size: NAME, mirror: true, ...APP[1] };
const ORDERS_SIDE = sidecarAt(ORDERS);
const PAYMENTS_SIDE = sidecarAt(PAYMENTS);

const PIPE_X1 = CX - PIPE_LEN / 2;
const PIPE_X2 = CX + PIPE_LEN / 2;
// A pipe or a store as an arrow target is its bounding rect.
const PIPE = { x: (PIPE_X1 + PIPE_X2) / 2, y: SIDE_Y, w: PIPE_X2 - PIPE_X1 + 2 * PIPE_RX, h: 2 * PIPE_RY };
const STORE = { x: CX, y: STORE_Y, w: STORE_W, h: STORE_W / STORE_RATIO };

// Save state runs down from the sidecar's bottom node and turns into the
// store's left side, stopping 2 short of its rect like arrow().
const DROP_TOP = ORDERS_SIDE.y + ORDERS_SIDE.r;
const SAVE_RUN = [[ORDERS_SIDE.x, DROP_TOP], [ORDERS_SIDE.x, STORE_Y], [STORE.x - STORE.w / 2 - 2, STORE_Y]];

// Labels centre on the leg they name.
const PUB_X = (ORDERS_SIDE.x + hexHalfWidth(R_S) + CX - PIPE_REACH) / 2;
const SUB_X = (PAYMENTS_SIDE.x - hexHalfWidth(R_S) + CX + PIPE_REACH) / 2;
// Beside a vertical run: anchored start, 12 units right of the line, centred
// on the straight leg above the turn, away from the Orders app. The head is
// on the other leg, so it has nothing to clear.
const SAVE_X = ORDERS_SIDE.x + 12;
const SAVE_Y = (DROP_TOP + STORE_Y - ELBOW_R) / 2;

export default {
  width: W,
  height: H,
  title: 'Orders and Payments services with Dapr sidecars, a Redis state store and Kafka pub/sub',
  desc:
    'A green hexagon named Orders with its Dapr sidecar overlapping its lower right, and a light '
    + 'blue hexagon named Payments with its Dapr sidecar overlapping its lower left. Between the two '
    + 'sidecars lies a green message broker holding the Kafka mark, named Kafka pub/sub. An arrow '
    + 'labelled Publish runs from the Orders sidecar to the broker, and an arrow labelled Subscribe '
    + 'runs from the broker to the Payments sidecar. From the bottom of the Orders sidecar, an arrow '
    + 'labelled Save state runs down and turns right into a gold data store under the broker, '
    + 'holding the Redis mark, named Redis state store.',

  build() {
    return [
      // Runs first, so the shapes paint over their ends.
      arrow({ from: ORDERS_SIDE, to: PIPE }),
      arrow({ from: PIPE, to: PAYMENTS_SIDE }),
      elbowArrow({ points: SAVE_RUN, r: ELBOW_R }),
      label({ x: PUB_X, y: SIDE_Y - WORD_DY, text: 'Publish', size: TEXT }),
      label({ x: SUB_X, y: SIDE_Y - WORD_DY, text: 'Subscribe', size: TEXT }),
      label({ x: SAVE_X, y: SAVE_Y, text: 'Save state', size: TEXT, anchor: 'start' }),

      appSidecar(ORDERS),
      appSidecar(PAYMENTS),

      group([
        pipe({ x1: PIPE_X1, x2: PIPE_X2, y: SIDE_Y, ry: PIPE_RY, rx: PIPE_RX }),
        icon({ name: 'kafka', x: CX, y: SIDE_Y, size: MARK, fit: 'ink' }),
        label({ x: CX, y: PIPE_NAME_Y, text: 'Kafka pub/sub', size: NAME }),
      ]),

      group([
        cylinder({ x: STORE.x, y: STORE_Y, w: STORE_W }),
        icon({ name: 'redis', x: STORE.x, y: STORE_Y, size: MARK, color: C.appInk, fit: 'ink' }),
        label({ x: STORE.x, y: STORE_NAME_Y, text: 'Redis state store', size: NAME }),
      ]),
    ];
  },
};
