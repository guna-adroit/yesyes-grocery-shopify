export function initInfiniteScroll() {
  return new Ajaxinate({
    method: 'click',
    container: '#AjaxinateContainer',
    pagination: '#AjaxinatePagination',
  });
}