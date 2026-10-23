/* The destination independently verifies the signed-in owner on every request. */
(function () {
  'use strict';
  function mount() {
    var user = window.kdhUser && window.kdhUser();
    if (!user || user.role !== 'manager' || user.preview ||
        !window.kdhIsOwner || !window.kdhIsOwner(user)) return;
    var header = document.querySelector('main.home.mh .hh');
    if (!header || document.getElementById('kdhPrivatePreviewLink')) return;
    var link = document.createElement('a');
    link.id = 'kdhPrivatePreviewLink';
    link.className = 'btn';
    link.textContent = 'Private Preview';
    link.href = window.KDH_AUTH && window.KDH_AUTH.privatePreview ? '/' :
      'https://kohler-dist-master-dashboard-q1vgyypqs.vercel.app/';
    link.target = '_blank';
    link.rel = 'noopener';
    link.setAttribute('aria-label', 'Open Private Preview in a new tab');
    header.appendChild(link);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
}());
