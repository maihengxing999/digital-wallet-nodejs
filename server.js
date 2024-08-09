const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const config = require('./config');
const routes = require('./routes');
const errorMiddleware = require('./middleware/error.middleware');

const app = express();

mongoose.connect(config.mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useCreateIndex: true,
  useFindAndModify: false
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

app.use(cors());
app.use(express.json());

// Use routes
app.use('/api', routes);

// Error handling middleware
app.use(errorMiddleware);

const PORT = config.port;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = app;
