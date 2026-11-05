namespace LetsPlayDarts.Domain;

/// <summary>
/// Pool of themed display names boards can be randomly assigned from
/// (see <see cref="Entities.Board.Rename"/>), so a new tournament can get a
/// fresh, playful set of board names instead of plain numbers.
/// </summary>
public static class BoardNamePool
{
    public static readonly string[] Names =
    [
        // Serien
        "Jesse Pinkman", "Saul Goodman", "Gus Fring", "Walter White", "Tony Soprano",
        "Don Draper", "Eleven", "Jon Snow", "Tyrion Lannister", "Daenerys Targaryen",
        "Dexter Morgan", "Rick Grimes", "Negan",

        // Berühmte Protagonisten
        "Indiana Jones", "James Bond", "John Wick", "Sherlock Holmes", "Harry Potter",
        "Frodo Beutlin", "Luke Skywalker", "Katniss Everdeen", "Ethan Hunt", "Jack Sparrow",
        "Neo", "Lara Croft", "Jason Bourne",

        // Superhelden
        "Batman", "Superman", "Iron Man", "Spider-Man", "Wonder Woman",
        "Thor", "Hulk", "Deadpool", "Black Panther", "Captain America",
        "Wolverine", "Aquaman",

        // Genies
        "Einstein", "Tesla", "Leonardo da Vinci", "Newton", "Hawking",
        "Marie Curie", "Archimedes", "Oppenheimer", "Galileo", "Darwin",
        "Mozart", "Aristoteles",

        // Regierungschefs & historische Persönlichkeiten
        "Churchill", "Napoleon", "Bismarck", "Kennedy", "Mandela",
        "Cleopatra", "Alexander der Große", "Genghis Khan", "Gandhi", "Lincoln",
        "Charlemagne", "Washington",

        // Disney & Cartoon-Figuren
        "Mickey Mouse", "Donald Duck", "Simba", "Elsa", "Bugs Bunny",
        "Homer Simpson", "Scrooge McDuck", "SpongeBob", "Shrek", "Woody",
        "Buzz Lightyear", "Timon", "Pumbaa",

        // Griechische Mythologie
        "Zeus", "Hercules", "Athena", "Poseidon", "Apollo",
        "Achilles", "Ares", "Hermes", "Aphrodite", "Hades",
        "Perseus", "Odysseus", "Medusa",

        // Römisches Reich
        "Julius Caesar", "Augustus", "Nero", "Hadrian", "Spartacus",
        "Marcus Aurelius", "Trajan", "Caligula", "Konstantin", "Brutus",
        "Pompeius", "Tiberius",

        // Berühmte Sänger/Sängerinnen
        "Elvis Presley", "Michael Jackson", "Freddie Mercury", "Madonna", "Beyoncé",
        "Frank Sinatra", "Whitney Houston", "David Bowie", "Prince", "Johnny Cash",
        "Tina Turner", "Elton John",

        // Schauspieler/Schauspielerinnen
        "Marilyn Monroe", "Audrey Hepburn", "Clint Eastwood", "Meryl Streep", "Tom Hanks",
        "Brad Pitt", "Angelina Jolie", "Leonardo DiCaprio", "Johnny Depp", "Charlie Chaplin",
        "Humphrey Bogart", "Scarlett Johansson",
    ];
}
