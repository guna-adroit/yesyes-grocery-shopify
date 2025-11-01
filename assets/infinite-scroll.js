import { FilterUpdateEvent, ThemeEvents } from '@theme/events';

document.addEventListener(ThemeEvents.FilterUpdate, function() {
  console.log("Filter Update");
    var endlessScroll = new Ajaxinate({
            method: 'click',
            container: '#AjaxinateContainer',
            pagination: '#AjaxinatePagination'
          });
});
export function initInfiniteScroll() {
  return new Ajaxinate({
    method: 'click',
    container: '#AjaxinateContainer',
    pagination: '#AjaxinatePagination',
  });
}