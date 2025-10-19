import * as AnointmentsModule from "./module";

(window as any).OverlayPoe1Anointments = {
  show: AnointmentsModule.show,
  render: AnointmentsModule.render,
  applyFilter: AnointmentsModule.applyFilter,
  reload: AnointmentsModule.reload
};
