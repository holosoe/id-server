Backend for Lobby3 ID.

## Creds Serialization

For every user, the following fields are represented as bytes, concatenated, and stored in the `creds` column of the `Users` table.

| field           | number of bytes |
| --------------- | --------------- |
| `nameFirst`     | 14              |
| `middleInitial` | 1               |
| `lastName`      | 14              |
| `birthdate`     | 4               |
| `countryCode`   | 3               |
| `streetAddr1`   | 16              |
| `streetAddr2`   | 12              |
| `city`          | 16              |
| `postalCode`    | 8               |
