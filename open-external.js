window.abrirExterno = function(url) {
  try {
    var intentUrl = url.replace(/^https?:\/\//, '');
    var intent = 'intent://' + intentUrl + '#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;package=com.android.chrome;end';
    window.location.href = intent;
  } catch(e) {
    window.open(url, '_blank');
  }
};
