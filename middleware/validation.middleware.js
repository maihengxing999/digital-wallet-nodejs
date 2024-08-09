const createValidationMiddleware = (validationFunction) => {
    return (req, res, next) => {
      const { error } = validationFunction(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }
      next();
    };
  };

  module.exports = createValidationMiddleware;
