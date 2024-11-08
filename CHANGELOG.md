# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 1.7.3 - 2024-11-08

### Fixed

- Message telling you to update from a non-existent version.

## 1.7.2 - 2024-11-07

### Fixed

- Adjust changes to Uploads response format (https://github.com/meower-media/uploads/issues/7)

### Deprecated

- Removed keys from Uploads response format (https://github.com/meower-media/uploads/issues/7)

## 1.7.1 - 2024-11-02

### Fixed

- Aliases overriding existing commands.
- Commands with whitespace silently breaking (instead of erroring).

## 1.7.0 - 2024-11-01

### Added

- Command aliases.

### Fixed

- Automatic reconnection when disconnecting.
- "None" group category in help message.

## 1.6.3 - 2024-09-28

### Fixed

- Memory leak causing post edits to create unnecessary objects exponentially.

## 1.6.1 - 2024-08-20

### Fixed

- Banning and admin specific commands are actually enforced. (1.4.0 regression)

## 1.6.0 - 2024-08-07

### Added

- Post deletion.
- `postDelete` event on bots and `delete` event on posts.
- `updatePost` event on bots that looks for post edits and other changes.
- `stringifyPatternType` function to turn a pattern type into a human readable format.
- Improved logging; option to disable logging.

### Changed

- Replaced the `Post` type with a `RichPost` class. (The `Post` type is still available.)
- Post deletion/replying using the `RichPost` class.
- More idiomatic keys on posts (camelCase instead of snake_case, no single letter keys).

### Deprecated

- The old keys on posts. See JSR documentation for details.

## 1.5.3 - 2024-08-03

### Removed

- Unused key in the constructor options.

## 1.5.2 - 2024-08-03

### Changed

- Allow any capitalization of the username in commands.

## 1.5.1 - 2024-08-02

### Added

- Logging for when the web socket disconnects.

## 1.5.0 - 2024-08-02

### Added

- Checking for updates.
- Setting categories.

### Changed

- Nicer format for help command.

## 1.4.1 - 2024-08-01

_Documentation and code style fixes, no functionality change_

## 1.4.0 - 2024-08-01

### Added

- Customizable messages.
- `RoarBot.prototype.user` to get a user's profile.

### Fixed

- "The command undefined doesn't exist!" when sending a message only pinging the bot.
- Made failures to post (as caused by i.e. rate limits) not crash the bot.

## 1.3.0 - 2024-08-01

### Added

- `RoarBot.prototype.commands` property for accessing commands.
- `RoarBot.prototype.ws` property for accessing the current WebSocket.
- `RoarBot.prototype.setAccountSettings` method for setting various account options.
- A message for commands that don't exist.

### Fixed

- A promise rejecting in a command will no longer crash the bot.

## 1.2.0 - 2024-08-01

### Added

- `RoarBot.prototype.run` to separate code into separate files.

### Fixed

- Require unique names for each command.

## 1.1.0 - 2024-08-01

### Added

- Banning users.
- Option to disable help command.

## 1.0.1 - 2024-07-31

### Added

- Example in module documentation.
- Documentation for `Post`, `Attachment` and `UploadsAttachment`.
