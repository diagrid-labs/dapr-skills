package com.example.catalog;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/products")
public class ProductController {

  private final Map<String, Product> products = new ConcurrentHashMap<>();

  @PutMapping("/{sku}")
  public Mono<Product> put(@PathVariable String sku, @RequestBody Product product) {
    Product saved = new Product(sku, product.name(), product.price());
    products.put(sku, saved);
    return Mono.just(saved);
  }

  @GetMapping("/{sku}")
  public Mono<Product> get(@PathVariable String sku) {
    return Mono.justOrEmpty(products.get(sku));
  }
}
