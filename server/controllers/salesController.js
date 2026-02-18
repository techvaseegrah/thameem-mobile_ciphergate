const Sale = require('../models/Sale');
const { Part, Settings } = require('../models/Schemas');
const mongoose = require('mongoose');

// Generate unique sale number
async function generateSaleNumber() {
    try {
        // Find or create settings document
        let settings = await Settings.findOne();
        if (!settings) {
            settings = new Settings({ lastSaleNumber: 0 });
        }

        // Increment sale number
        settings.lastSaleNumber += 1;
        await settings.save();

        // Format: SALE-YYYYMMDD-XXXX
        const date = new Date();
        const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
        const saleNum = String(settings.lastSaleNumber).padStart(4, '0');

        return `SALE-${dateStr}-${saleNum}`;
    } catch (error) {
        throw new Error('Failed to generate sale number: ' + error.message);
    }
}

// POST /api/sales - Create new sale
exports.createSale = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { products, customer, paymentMethod, soldBy, discount = 0 } = req.body;

        // Validate required fields
        if (!products || products.length === 0) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ error: 'At least one product is required' });
        }

        // Validate and calculate totals
        let totalAmount = 0;
        const saleProducts = [];

        for (const item of products) {
            // Fetch product from inventory
            const product = await Part.findById(item.product).session(session);

            if (!product) {
                await session.abortTransaction();
                session.endSession();
                return res.status(404).json({ error: `Product not found: ${item.product}` });
            }

            // Check stock availability
            if (product.stock < item.quantity) {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({
                    error: `Insufficient stock for ${product.name}. Available: ${product.stock}, Requested: ${item.quantity}`
                });
            }

            // Use selling price from inventory
            const unitPrice = product.selling_price || 0;
            const totalPrice = unitPrice * item.quantity;

            saleProducts.push({
                product: item.product,
                quantity: item.quantity,
                unitPrice: unitPrice,
                totalPrice: totalPrice
            });

            totalAmount += totalPrice;

            // Reduce inventory stock
            product.stock -= item.quantity;
            await product.save({ session });
        }

        // Apply discount
        const discountAmount = Math.max(0, Math.min(Number(discount) || 0, totalAmount));
        totalAmount = totalAmount - discountAmount;

        // Generate sale number
        const saleNumber = await generateSaleNumber();

        // Create sale record
        const sale = new Sale({
            saleNumber,
            products: saleProducts,
            customer: customer || {},
            discount: discountAmount,
            totalAmount,
            paymentMethod: paymentMethod || 'cash',
            soldBy: soldBy || null
        });

        await sale.save({ session });

        // Commit transaction
        await session.commitTransaction();
        session.endSession();

        // Populate product details before sending response
        const populatedSale = await Sale.findById(sale._id)
            .populate('products.product', 'name sku')
            .populate('soldBy', 'name');

        res.status(201).json(populatedSale);
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error('Error creating sale:', error);
        res.status(500).json({ error: error.message });
    }
};

// GET /api/sales - Get all sales with optional filters
exports.getAllSales = async (req, res) => {
    try {
        const { startDate, endDate, paymentMethod, page = 1, limit = 50 } = req.query;

        // Build filter query
        const filter = {};

        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) {
                const endDateTime = new Date(endDate);
                endDateTime.setHours(23, 59, 59, 999);
                filter.createdAt.$lte = endDateTime;
            }
        }

        if (paymentMethod) {
            filter.paymentMethod = paymentMethod;
        }

        // Calculate pagination
        const skip = (page - 1) * limit;

        // Fetch sales with pagination
        const sales = await Sale.find(filter)
            .populate('products.product', 'name sku')
            .populate('soldBy', 'name')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        // Get total count for pagination
        const total = await Sale.countDocuments(filter);

        res.json({
            sales,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching sales:', error);
        res.status(500).json({ error: error.message });
    }
};

// GET /api/sales/:id - Get sale by ID
exports.getSaleById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: 'Invalid sale ID format' });
        }

        const sale = await Sale.findById(id)
            .populate('products.product', 'name sku category')
            .populate('soldBy', 'name email');

        if (!sale) {
            return res.status(404).json({ error: 'Sale not found' });
        }

        res.json(sale);
    } catch (error) {
        console.error('Error fetching sale:', error);
        res.status(500).json({ error: error.message });
    }
};

// GET /api/sales/stats - Get sales statistics
exports.getSalesStats = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        // Build filter query
        const filter = {};

        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) {
                const endDateTime = new Date(endDate);
                endDateTime.setHours(23, 59, 59, 999);
                filter.createdAt.$lte = endDateTime;
            }
        }

        // Get total sales and revenue
        const totalSales = await Sale.countDocuments(filter);

        const revenueResult = await Sale.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: '$totalAmount' }
                }
            }
        ]);

        const totalRevenue = revenueResult.length > 0 ? revenueResult[0].totalRevenue : 0;

        // Get sales by payment method
        const salesByPaymentMethod = await Sale.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: '$paymentMethod',
                    count: { $sum: 1 },
                    revenue: { $sum: '$totalAmount' }
                }
            }
        ]);

        // Get top selling products
        const topProducts = await Sale.aggregate([
            { $match: filter },
            { $unwind: '$products' },
            {
                $group: {
                    _id: '$products.product',
                    totalQuantity: { $sum: '$products.quantity' },
                    totalRevenue: { $sum: '$products.totalPrice' }
                }
            },
            { $sort: { totalQuantity: -1 } },
            { $limit: 10 }
        ]);

        // Populate product details
        const populatedTopProducts = await Part.populate(topProducts, {
            path: '_id',
            select: 'name sku'
        });

        res.json({
            totalSales,
            totalRevenue,
            salesByPaymentMethod,
            topProducts: populatedTopProducts
        });
    } catch (error) {
        console.error('Error fetching sales stats:', error);
        res.status(500).json({ error: error.message });
    }
};
