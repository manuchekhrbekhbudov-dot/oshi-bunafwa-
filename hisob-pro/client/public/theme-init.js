// Мавзӯи интихобшударо пеш аз бор шудани React татбиқ мекунад (бе "дурахш")
try {
  if (localStorage.getItem('hisob-theme') === 'light') document.documentElement.classList.remove('dark');
} catch (e) {}
