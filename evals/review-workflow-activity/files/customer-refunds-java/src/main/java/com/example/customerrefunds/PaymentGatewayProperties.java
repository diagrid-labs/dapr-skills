package com.example.customerrefunds;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "refunds.gateway")
public record PaymentGatewayProperties(String baseUrl, String ledgerUrl) {
}
