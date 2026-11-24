// An app with its Dapr sidecar, saving state to Redis and publishing to Kafka.
// One app, so it takes APP[0] (green) and the broker takes sky instead of the
// house green. The sidecar is what reaches the components, so both runs start
// at the sidecar, as one trunk that forks on a bus.
import { C, APP } from '../_engine/engine.mjs';
import { cylinder, elbowArrow, group, hexHalfWidth, label, pipe, STORE_RATIO } from '../_engine/shapes.mjs';
import { appSidecar, sidecarAt } from '../_engine/app.mjs';
import { icon } from '../_engine/icons.mjs';

const W = 560; // 16:9, the extra air on the long axis
const H = 315;

const TEXT = 13; // the labels on the runs
const NAME = 15; // every shape's name, so the three names match

// The app and its sidecar. sidecarAt() says where the sidecar lands, so the
// runs start on the drawing rather than on a copy of its offsets.
const APP_R = 54;
const APP_X = 103;
const APP_Y = 92;
const SIDE = sidecarAt({ x: APP_X, y: APP_Y, r: APP_R, size: NAME });

// One trunk leaves the sidecar square out of its right edge and forks at BUS_X.
const TRUNK_X0 = SIDE.x + hexHalfWidth(SIDE.r) + 2;
const BUS_X = TRUNK_X0 + 44;
const SPREAD = 86; // each component sits this far above or below the trunk
const LEG = 120; // bus to component: the label's width plus two characters each side

// Both components share a left edge, so both legs are the same length.
const LEFT = BUS_X + LEG;

const STORE_W = 120;
const STORE_X = LEFT + STORE_W / 2;
const STORE_Y = SIDE.y - SPREAD;
const STORE_H = STORE_W / STORE_RATIO;

const PIPE_RX = 12;
const PIPE_RY = 30;
const PIPE_X1 = LEFT + PIPE_RX;
const PIPE_X2 = PIPE_X1 + 140; // 2.33 diameters, inside pipe()'s 2 to 3
const PIPE_X = (PIPE_X1 + PIPE_X2) / 2;
const PIPE_Y = SIDE.y + SPREAD;

const MARK = 40; // both marks, fitted to their ink so they weigh the same
const WORD_DY = 14; // a label rides this far above its run
const NAME_DY = 18; // a name sits this far below its shape

const run = (y) => [[TRUNK_X0, SIDE.y], [BUS_X, SIDE.y], [BUS_X, y], [LEFT - 2, y]];
const SPAN_X = (BUS_X + LEFT) / 2; // labels centre on the leg they name

export default {
  width: W,
  height: H,
  title: 'An app saving state and publishing messages through its Dapr sidecar',
  desc:
    'A green hexagon named Checkout with its Dapr sidecar overlapping its lower right. '
    + 'From the sidecar one line forks in two. The upper branch, labelled Save state, ends at '
    + 'a gold data store holding the Redis mark, named Redis state store. The lower branch, '
    + 'labelled Publish, ends at a blue message broker lying on its side, holding the Kafka '
    + 'mark, named Kafka pub/sub broker.',

  build() {
    return [
      // Runs first, so the shapes paint over their ends.
      elbowArrow({ points: run(STORE_Y) }),
      elbowArrow({ points: run(PIPE_Y) }),
      label({ x: SPAN_X, y: STORE_Y - WORD_DY, text: 'Save state', size: TEXT }),
      label({ x: SPAN_X, y: PIPE_Y - WORD_DY, text: 'Publish', size: TEXT }),

      appSidecar({ x: APP_X, y: APP_Y, r: APP_R, label: 'Checkout', size: NAME, ...APP[0] }),

      group([
        cylinder({ x: STORE_X, y: STORE_Y, w: STORE_W }),
        icon({ name: 'redis', x: STORE_X, y: STORE_Y, size: MARK, color: C.appInk, fit: 'ink' }),
        label({ x: STORE_X, y: STORE_Y + STORE_H / 2 + NAME_DY, text: 'Redis state store', size: NAME }),
      ]),

      group([
        pipe({ x1: PIPE_X1, x2: PIPE_X2, y: PIPE_Y, ry: PIPE_RY, rx: PIPE_RX, fill: C.appSky }),
        icon({ name: 'kafka', x: PIPE_X, y: PIPE_Y, size: MARK, fit: 'ink' }),
        label({ x: PIPE_X, y: PIPE_Y + PIPE_RY + NAME_DY, text: 'Kafka pub/sub broker', size: NAME }),
      ]),
    ];
  },
};
