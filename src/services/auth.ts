import { Auth, LoginResponse } from "../interfaces/auth.interface";
import UserModel from "../models/user";
import { verify } from "../utils/bcrypt.handle";
import { generateAccessToken, generateRefreshToken } from "../utils/jwt.handle";

const loginUser = async ({ email, password }: Auth): Promise<LoginResponse | "USER_NOT_FOUND" | "INCORRECT_PASSWORD"> => {
  const user = await UserModel.findOne({ email });
  if (!user) return "USER_NOT_FOUND";

  const hashedPassword = user.password;
  const isValidPassword = await verify(password, hashedPassword);
  if (!isValidPassword) return "INCORRECT_PASSWORD";

  const accessToken = await generateAccessToken(user.email);
  const refreshToken = await generateRefreshToken(user.email);

  const data = {
    accessToken,
    refreshToken
    // user,
  };
  
  return data;
};

export default { loginUser };
