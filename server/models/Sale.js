const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const SaleSchema = new Schema({
    saleNumber: {
        type: String,
        required: true,
        unique: true
    },
    products: [{
        product: {
            type: Schema.Types.ObjectId,
            ref: 'Part',
            required: true
        },
        quantity: {
            type: Number,
            required: true,
            min: 1
        },
        unitPrice: {
            type: Number,
            required: true
        },
        totalPrice: {
            type: Number,
            required: true
        }
    }],
    customer: {
        name: { type: String },
        phone: { type: String }
    },
    discount: {
        type: Number,
        default: 0
    },
    totalAmount: {
        type: Number,
        required: true
    },
    paymentMethod: {
        type: String,
        enum: ['cash', 'card', 'upi', 'bank_transfer'],
        default: 'cash'
    },
    soldBy: {
        type: Schema.Types.ObjectId,
        ref: 'Worker'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Sale', SaleSchema);
