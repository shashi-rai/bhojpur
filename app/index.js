'use strict';

const _ = require('lodash');
const bodyParser = require('body-parser');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const express = require('express');
const expressValidator = require('express-validator');
const forceSSL = require('express-force-ssl');
const passport = require('passport');
const path = require('path');
const rev = require('express-rev');
const winston = require('winston');
const moment = require('moment');

const helmet = require('helmet');
const csrf = require('csurf');

const middleware = require('./middleware');
const routes = require('./routes');

const app = express();

app.locals.env = app.get('env');
app.locals._ = _;
app.locals.moment = moment;
app.locals.basedir = path.join(__dirname, 'views');

app.locals.CDN = (url) => {
  const cdnUrl = app.get('env') === 'development' ? '' : '';
  return `${cdnUrl}${url}`;
};

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.set('forceSSLOptions', {
  trustXFPHeader: true,
});

if (app.get('env') === 'production') {
  app.use(forceSSL);
}

app.use(helmet());
app.use(compression());
app.use(bodyParser.text());
app.use(bodyParser.json({ limit: '100mb' }));
app.use(bodyParser.urlencoded({ limit: '100mb', extended: true }));
app.use(middleware.session);
app.use(expressValidator());
app.use(cookieParser());

app.use(rev({
  manifest: path.join(__dirname, '../public/dist', 'manifest.json'),
  prepend: '/dist',
}));

app.use(express.static(path.join(__dirname, '../public'), {
  maxAge: '30 days',
}));

app.use((req, res, next) => {
  res.locals.currentUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  next();
});

app.use(middleware.setCurrentPath);
app.use(middleware.urlConstructor);

function specificCsurf(ignoreUrls) {
  const cur = csrf({ cookie: true });
  return function (req, res, next) {
    if (req.originalUrl.match(ignoreUrls) && req.originalUrl.match(ignoreUrls).length > 0) {
      return next();
    }
    return cur(req, res, next);
  };
}

app.use(specificCsurf('\/api\/|\/serviceapi\/|\/adminapi\/|\/auth\/')); // eslint-disable-line no-useless-escape

app.use(middleware.setCSRFToken);
app.use(passport.initialize());
app.use(passport.session());
app.use(middleware.impersonateUser);
app.use(middleware.currentUser);
app.use('/', routes);

app.use((req, res) => {
  res.render('not-found', { status: 404 });
});

if (app.get('env') === 'development') {
  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    res.status(err.status || 500);
    winston.error(err.message, err);
    res.render('error', {
      message: err.message,
      error: err,
    });
  });
} else {
  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    winston.error(err.message, err);
    res.render('error', { status: 500 });
  });
}

module.exports = app;