package com.example.notifications;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/** Stands in for an SMTP client: logs the e-mail it would send. */
@Service
public class EmailSender {

  private static final Logger logger = LoggerFactory.getLogger(EmailSender.class);

  public void send(String to, String subject, String body) {
    if (to == null || to.isBlank()) {
      throw new IllegalArgumentException("to is required");
    }
    logger.info("Sending e-mail to {}: {}", to, subject);
  }
}
