package com.example.warehouserestock;

import java.time.Instant;

public record SupplierOrderRequest(String purchaseOrderId, String sku, int quantity, Instant deliverBy) {
}
