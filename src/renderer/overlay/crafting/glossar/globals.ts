import * as Glossar from './module';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).OverlayGlossar = {
  show: Glossar.show,
  render: Glossar.render,
};
