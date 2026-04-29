const express = require('express');
const exphbs = require('express-handlebars');
const path = require('path');

const app = express();

const hbs = exphbs.create({
  defaultLayout: 'main',
  layoutsDir: path.join(__dirname, 'views/layouts'),
  partialsDir: [
    path.join(__dirname, 'views/partials')
  ],
  helpers: {
    fileIcon: (fileType) => {
      const icons = {
        video: '🎬',
        image: '🖼️',
        audio: '🎵',
        document: '📄',
        archive: '📦',
        program: '⚙️',
        other: '📋'
      };
      return icons[fileType] || '📄';
    }
  }
});

app.engine('hbs', hbs.engine);
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

app.get('/', (req, res) => {
  res.render('index', { title: 'Тест' });
});

app.listen(3001, () => {
  console.log('Тестовый сервер запущен на порту 3001');
  setTimeout(() => process.exit(0), 3000);
});
