// The person's account defaults as a page reads and writes them (FR-11.7, FR-06.6, TON-138, TON-282): the values every
// view follows where it has no choice of its own, where links open, the streaming services turned off, and their order. Each write goes
// through the sync client's defaults collection, so it shows at once and reaches the person's other sessions; the
// save-state layer reports one that fails.

import { defaultsKey } from "@/client/sync/views";
import { sent } from "@/client/sync/writer";
import { useCollectionData } from "@/features/collection/data";
import { useSyncClient } from "@/features/sync/sync-provider";

import {
  servicesInOrder,
  streamingServices,
  type AccountDefaults,
  type StreamingService,
} from "@tonaris/domain";

export type AccountDefaultsControl = {
  defaults: AccountDefaults;
  /** Whether the defaults have loaded, so the controls can be used. */
  ready: boolean;
  /** Saves the given defaults; the rest stay as they are. */
  set: (values: Partial<AccountDefaults>) => void;
  /** Turns a service on or off, keeping the list in the services' order. */
  setService: (service: StreamingService, on: boolean) => void;
  /** Moves a service to place `to`, counted from 0, in the person's order (TON-282). */
  moveService: (service: StreamingService, to: number) => void;
};

export function useAccountDefaults(): AccountDefaultsControl {
  const client = useSyncClient();
  const { defaults, ready } = useCollectionData();

  function set(values: Partial<AccountDefaults>) {
    if (!client?.defaults.has(defaultsKey)) return;
    sent(
      client.defaults.update(defaultsKey, (draft) => {
        Object.assign(draft, values);
      }),
    );
  }

  function setService(service: StreamingService, on: boolean) {
    const hidden = new Set(defaults.hiddenServices);
    if (on) hidden.delete(service);
    else hidden.add(service);
    set({ hiddenServices: streamingServices.filter((each) => hidden.has(each)) });
  }

  function moveService(service: StreamingService, to: number) {
    const order = servicesInOrder(defaults.serviceOrder).filter((each) => each !== service);
    order.splice(Math.max(0, Math.min(to, order.length)), 0, service);
    set({ serviceOrder: order });
  }

  return { defaults, ready, set, setService, moveService };
}
