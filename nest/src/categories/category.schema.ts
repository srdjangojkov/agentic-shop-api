import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

// Copied from ../../../src/models/category.ts (fields and options).
@Schema({ collection: "categories", timestamps: true, versionKey: false })
export class Category {
  @Prop({ type: String, required: true, unique: true })
  name!: string;

  @Prop({ type: Boolean, required: true, default: true })
  status!: boolean;
}

export type CategoryDocument = HydratedDocument<Category>;
export const CategorySchema = SchemaFactory.createForClass(Category);
