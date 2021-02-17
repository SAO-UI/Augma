import { createVNode, render, isVNode } from "vue";
import NotificationConstructor from "./index.vue";
import isServer from "@augma/utils/isServer";
import PopupManager from "@augma/utils/popup-manager";

import type { ComponentPublicInstance } from "vue";
import type {
  INotificationOptions,
  INotification,
  NotificationQueue,
  NotificationVM,
  Position,
} from "./notification.type";
import { TypeArray } from "@augma/shared";

const notifications: Record<Position, NotificationQueue> = {
  "top-left": [],
  "top-right": [],
  "bottom-left": [],
  "bottom-right": [],
};

let seed = 1;

const Notification: INotification = function (options = {}) {
  if (isServer) return;
  const position = options.position || "top-right";
  const initOffset = 80;

  let verticalOffset = options.offset || initOffset;
  notifications[position].forEach(({ vm }) => {
    // vm.el.offsetHeight 该元素的像素高度
    verticalOffset += (vm.el.offsetHeight || initOffset) + 16;
  });
  verticalOffset += 16;

  const id = "notification_" + seed++;
  const userOnClose = options.onClose;
  options = {
    // default option
    ...options,
    onClose: () => {
      close(id, position, userOnClose);
    },
    offset: verticalOffset,
    id,
    zIndex: PopupManager.nextZIndex(),
  };

  const container = document.createElement("div");

  const vm = createVNode(
    NotificationConstructor,
    options,
    isVNode(options.message)
      ? {
          default: () => options.message,
        }
      : null
  );

  // clean notification element preventing mem leak
  vm.props.onDestroy = () => {
    render(null, container);
  };

  // instances will remove this item when close function gets called. So we do not need to worry about it.
  render(vm, container);
  notifications[position].push({ vm });
  document.body.appendChild(container.firstElementChild as Node);

  return {
    // instead of calling the onClose function directly, setting this value so that we can have the full lifecycle
    // for out component, so that all closing steps will not be skipped.
    close: () => {
      (vm.component.proxy as ComponentPublicInstance<{
        visible: boolean;
      }>).visible = false;
    },
  };
};

TypeArray.forEach((type) => {
  Object.assign(Notification, {
    [type]: (options: NotificationVM | INotificationOptions | string = {}) => {
      if (typeof options === "string" || isVNode(options)) {
        options = {
          message: options,
        };
      }
      options.type = type;
      return Notification(options);
    },
  });
});

/**
 * close notification animation
 * This function gets called when user click `x` button or press `esc` or the time reached its limitation.
 * Emitted by transition@before-leave event so that we can fetch the current notification.offsetHeight, if this was called
 * by @after-leave the DOM element will be removed from the page thus we can no longer fetch the offsetHeight.
 * @param {String} id notification id to be closed
 * @param {Position} position the positioning strategy
 * @param {Function} userOnClose the callback called when close passed by user
 */
export function close(
  id: string,
  position: Position,
  userOnClose?: (vm: NotificationVM) => void
): void {
  // maybe we can store the index when inserting the vm to notification list.
  const orientedNotifications = notifications[position];
  const idx = orientedNotifications.findIndex(({ vm }) => {
    const { id: _id } = vm.component.props;
    return id === _id;
  });

  if (idx === -1) {
    return;
  }

  const { vm } = orientedNotifications[idx];
  if (!vm) return;
  // calling user's on close function before notification gets removed from DOM.
  userOnClose?.(vm);

  // note that this is called @before-leave, that's why we were able to fetch this property.
  const removedHeight = vm.el.offsetHeight;
  orientedNotifications.splice(idx, 1);
  const len = orientedNotifications.length;
  if (len < 1) return;
  // starting from the removing item.
  for (let i = idx; i < len; i++) {
    const verticalPos = position.split("-")[0];
    // new position equals the current offsetTop minus removed height plus 16px(the gap size between each item)
    const pos =
      parseInt(orientedNotifications[i].vm.el.style[verticalPos], 10) -
      removedHeight -
      16;

    orientedNotifications[i].vm.component.props.offset = pos;
  }
}

export function closeAll(): void {
  // loop through all directions, close them at once.
  for (const key in notifications) {
    const orientedNotifications = notifications[key as Position];
    orientedNotifications.forEach(({ vm }) => {
      // same as the previous close method, we'd like to make sure lifecycle gets handle properly.
      (vm.component.proxy as ComponentPublicInstance<{
        visible: boolean;
      }>).visible = false;
    });
  }
}

export default Notification;
