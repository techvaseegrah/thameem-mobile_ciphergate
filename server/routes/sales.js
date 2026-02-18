const express = require('express');
const router = express.Router();
const salesController = require('../controllers/salesController');

// Create new sale
router.post('/', salesController.createSale);

// Get all sales with optional filters
router.get('/', salesController.getAllSales);

// Get sales statistics
router.get('/stats', salesController.getSalesStats);

// Get sale by ID (must be after /stats to avoid conflict)
router.get('/:id', salesController.getSaleById);

module.exports = router;
