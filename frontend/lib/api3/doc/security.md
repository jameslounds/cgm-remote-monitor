# APIv3: Security

### Enforcing HTTPS

APIv3 is ment to run only under SSL version of HTTP protocol, which provides:

- **message secrecy** - once the secure channel between client and server is closed the communication cannot be eavesdropped by any third party
- **message consistency** - each request/response is protected against modification by any third party (any forgery would be detected)
- **authenticity of identities** - once the client and server establish the secured channel, it is guaranteed that the identity of the client or server does not change during the whole session

HTTPS (in use with APIv3) does not address the true identity of the client, but ensures the correct identity of the server. Furthermore, HTTPS does not prevent the resending of previously intercepted encrypted messages by an attacker.

---

### Authentication and authorization

In APIv3, _API_SECRET_ can no longer be used for authentication or authorization. Instead, a roles/permissions security model is used, which is managed in the _Admin tools_ section of the web application.

The identity of the client is represented by the _subject_ to whom the access level is set by assigning security _roles_. One or more _permissions_ can be assigned to each role. Permissions are used in an [Apache Shiro-like style](http://shiro.apache.org/permissions.html "Apache Shiro-like style").

For each security _subject_, the system automatically generates an _access token_ that is difficult to guess since it is derived from the secret _API_SECRET_. The _access token_ must be included in every secured API operation to decode the client's identity and determine its authorization level. In this way, it is then possible to resolve whether the client has the permission required by a particular API operation.

There is only one way to authorize API calls:

- use so-called [JSON Web Tokens](https://jwt.io "JSON Web Tokens")
  - at first let the `/api/v2/authorization/request` generates you a particular JWT, eg. `GET https://nsapiv3.herokuapp.com/api/v2/authorization/request/testreadab-76eaff2418bfb7e0`
  - then, to each secure API operation attach a JWT token in the HTTP header, eg. `Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY2Nlc3NUb2tlbiI6InRlc3RyZWFkYWItNzZlYWZmMjQxOGJmYjdlMCIsImlhdCI6MTU2NTAzOTczMSwiZXhwIjoxNTY1MDQzMzMxfQ.Y-OFtFJ-gZNJcnZfm9r4S7085Z7YKVPiaQxuMMnraVk` (until the JWT expires)

---

APIv3 security is enabled by default, but it can be completely disabled for development and debugging purposes by setting the web environment variable `API3_SECURITY_ENABLE=false`.
This setting is hazardous and it is strongly discouraged to be used for production purposes!
