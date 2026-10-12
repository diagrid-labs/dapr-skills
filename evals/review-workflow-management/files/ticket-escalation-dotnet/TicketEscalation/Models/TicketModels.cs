namespace TicketEscalation.Models;

public record TicketInput(string Id, string CustomerId, string Priority, string Summary);
public record TicketOutput(string TicketId, string Resolution);
public record EngineerAck(string EngineerId);
public record PageRequest(string TicketId, string Priority);
