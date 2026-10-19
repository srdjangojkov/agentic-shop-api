import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Category, CategoryDocument } from "./category.schema";

@Injectable()
export class CategoriesService {
  constructor(@InjectModel(Category.name) private readonly categoryModel: Model<CategoryDocument>) {}

  getCategories() {
    return this.categoryModel.find({ status: true });
  }

  getCategory(id: string) {
    return this.categoryModel.findById(id);
  }

  // Returns the sentinel when the name is taken, like the Express service.
  async createCategory(name: string) {
    const categoryExists = await this.categoryModel.findOne({ name });
    if (categoryExists) return "CATEGORY_ALREADY_EXISTS";

    return this.categoryModel.create({ name });
  }

  // Express passes the whole body; only the schema's own fields are applied here (S8, parity.md).
  updateCategory(id: string, data: Partial<Category>) {
    return this.categoryModel.findByIdAndUpdate(id, data, { new: true });
  }
}
