package com.example.notifications;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class EmailSenderTest {

  private final EmailSender sender = new EmailSender();

  @Test
  void sendAcceptsAnAddress() {
    assertThatCode(() -> sender.send("ana@example.com", "Hello", "Hi Ana")).doesNotThrowAnyException();
  }

  @Test
  void sendRejectsAMissingAddress() {
    assertThatThrownBy(() -> sender.send(" ", "Hello", "Hi")).isInstanceOf(IllegalArgumentException.class);
  }
}
